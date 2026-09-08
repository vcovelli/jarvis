import "server-only";
import { access } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { getBuildInfo } from "@/lib/buildInfo";
import { getAppHealth, getReadiness } from "@/lib/health";
import { checkOpenClawHealth } from "@/lib/openclaw/client";
import { importantActions, presentActivity } from "./activity";

export type ServiceStatus = "Healthy" | "Degraded" | "Unavailable" | "Not configured";
export type AdminService = { name: string; status: ServiceStatus; detail: string };
export async function getAdminActivity() {
  const entries = await prisma.auditLog.findMany({ where: { action: { in: Object.keys(importantActions) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40,
    select: { id: true, userId: true, action: true, outcome: true, createdAt: true, metadata: true } });
  return entries.map(presentActivity);
}
export async function getAdminOverview() {
  const now = new Date();
  const [readiness, total, active, rollouts, latestSync, failedSync, connections, services] = await Promise.all([
    getReadiness(), prisma.user.count(), prisma.user.count({ where: { lastActiveAt: { gte: new Date(now.getTime() - 30 * 60_000) } } }),
    prisma.user.groupBy({ by: ["rolloutLevel"], _count: true }),
    prisma.auditLog.findFirst({ where: { action: { in: ["finance.scheduled_sync_completed", "finance.scheduled_sync_failed"] } }, orderBy: { createdAt: "desc" }, select: { createdAt: true, outcome: true } }),
    prisma.auditLog.count({ where: { action: "finance.scheduled_sync_failed", createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    prisma.financialConnection.count({ where: { provider: "plaid", status: "active" } }), getIntegrationStatuses(),
  ]);
  const scheduled = Boolean(process.env.INTERNAL_JOB_SECRET?.trim());
  const syncStatus: ServiceStatus = !scheduled ? "Not configured" : failedSync ? "Degraded" : !connections ? "Healthy" : !latestSync ? "Unavailable" : now.getTime() - latestSync.createdAt.getTime() > 24 * 60 * 60_000 ? "Degraded" : "Healthy";
  return {
    build: getBuildInfo(), health: getAppHealth(), readiness, uptimeSeconds: Math.floor(process.uptime()), checkedAt: now.toISOString(),
    users: { total, active, STABLE: rollouts.find((r) => r.rolloutLevel === "STABLE")?._count ?? 0, BETA: rollouts.find((r) => r.rolloutLevel === "BETA")?._count ?? 0, EXPERIMENTAL: rollouts.find((r) => r.rolloutLevel === "EXPERIMENTAL")?._count ?? 0 },
    services: [
      { name: "Jarvis App", status: "Healthy", detail: "This application process is responding." },
      { name: "Database", status: readiness.checks.database ? "Healthy" : "Unavailable", detail: readiness.checks.database ? "Readiness query succeeded." : "Database readiness query failed." },
      { name: "Finance Sync", status: syncStatus, detail: !scheduled ? "Scheduled sync authentication is not configured." : !connections ? "No active connections to sync." : failedSync ? `${failedSync} scheduled sync failures in the last 24 hours.` : latestSync ? `Last recorded run: ${latestSync.createdAt.toISOString()}.` : "No scheduled run recorded yet." },
      ...services,
    ] as AdminService[],
  };
}
async function getIntegrationStatuses(): Promise<AdminService[]> {
  const configured = (key: string) => Boolean(process.env[key]?.trim());
  // Configuration is evidence of setup, not a claim that a provider is reachable.
  const configOnly = (name: string, keys: string[]): AdminService => ({ name, status: keys.every(configured) ? "Unavailable" : keys.some(configured) ? "Degraded" : "Not configured", detail: keys.every(configured) ? "Configured; live provider health is not probed here." : keys.some(configured) ? "Configuration is incomplete." : "Optional integration is not configured." });
  const openClawConfigured = ["OPENCLAW_GATEWAY_URL", "OPENCLAW_CONFIG_PATH", "OPENCLAW_STATE_DIR"].some(configured);
  const homelabRoot = process.env.HOMELAB_DOCS_ROOT?.trim();
  const [openClaw, homelab] = await Promise.all([
    openClawConfigured ? checkOpenClawHealth().then((health) => health.ok).catch(() => false) : false,
    homelabRoot ? access(homelabRoot).then(() => true).catch(() => false) : false,
  ]);
  return [
    configOnly("Plaid", ["PLAID_CLIENT_ID", "PLAID_SECRET"]),
    configOnly("Assistant / OpenAI", ["OPENAI_API_KEY"]),
    { name: "OpenClaw", status: !openClawConfigured ? "Not configured" : openClaw ? "Healthy" : "Unavailable", detail: openClaw ? "Gateway health endpoint responded; chat authorization is checked when used." : openClawConfigured ? "Gateway health endpoint did not respond successfully." : "Optional gateway is not configured." },
    configOnly("RentCast", ["RENTCAST_API_KEY"]),
    { name: "Homelab", status: !homelabRoot ? "Not configured" : homelab ? "Healthy" : "Unavailable", detail: homelab ? "Documentation root is accessible; this does not verify all monitored services." : homelabRoot ? "Documentation source is unavailable." : "Optional documentation source is not configured." },
  ];
}
export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
