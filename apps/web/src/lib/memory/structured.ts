import { Prisma, type PrismaClient } from "@prisma/client";
import {
  assertAccess,
  classifyLabels,
  hasSecrets,
  type Access,
} from "./policy.ts";
import type { ContextRecord } from "./context.ts";

export type StructuredRequest = {
  domain: "finance" | "tasks" | "sleep" | "infrastructure";
  days: number;
};
export function planStructured(query: string): StructuredRequest[] {
  const days = /six months|6 months/i.test(query)
    ? 180
    : /week/i.test(query)
      ? 7
      : 30;
  const requests: StructuredRequest[] = [];
  if (/spend|net worth|cash.?flow|income|budget/i.test(query))
    requests.push({ domain: "finance", days });
  if (/task|todo|to-do|schedule/i.test(query))
    requests.push({ domain: "tasks", days });
  if (/sleep|rest|habit/i.test(query)) requests.push({ domain: "sleep", days });
  if (/server|homelab|infrastructure|telemetry/i.test(query))
    requests.push({ domain: "infrastructure", days });
  return requests;
}
export type FinanceSummary = (userId: string, days: number) => Promise<unknown>;
export async function structuredContext(
  db: PrismaClient,
  access: Access,
  query: string,
  finance?: FinanceSummary,
): Promise<ContextRecord[]> {
  assertAccess(access);
  const requests = planStructured(query),
    result: ContextRecord[] = [];
  for (const request of requests) {
    const label =
      request.domain === "finance"
        ? "finance"
        : request.domain === "sleep"
          ? "health"
          : request.domain === "infrastructure"
            ? "infrastructure"
            : "work";
    if (!access.labels.includes(label)) continue;
    if (
      access.agent !== "assistant" &&
      !(access.agent === "financial-analyst" && request.domain === "finance") &&
      !(
        access.agent === "infrastructure-monitor" &&
        request.domain === "infrastructure"
      )
    )
      continue;
    if (request.domain === "finance" && finance) {
      result.push({
        id: `finance:analytics:${request.days}d`,
        kind: "deterministic_financial_aggregation",
        data: await finance(access.userId, request.days),
      });
    } else if (request.domain === "infrastructure") {
      const observation = await db.operationsObservation.findFirst({
        where: {
          userId: access.userId,
          domain: "infrastructure",
          createdAt: { gte: new Date(Date.now() - 15 * 60000) },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, data: true },
      });
      // Fixed numeric allowlist; no hostnames, logs, credentials, or model-authored text.
      const metrics = (
        observation?.data as { metrics?: Record<string, unknown> } | undefined
      )?.metrics;
      const safe = Object.fromEntries(
        ["cpuPercent", "memoryUsedPct", "diskUsedPct", "uptimeSeconds"].flatMap(
          (k) => (typeof metrics?.[k] === "number" ? [[k, metrics[k]]] : []),
        ),
      );
      result.push({
        id: observation?.id ?? "infrastructure:unavailable",
        kind: "operational_observation",
        data: observation
          ? { at: observation.createdAt, metrics: safe }
          : {
              limitation:
                "No authorized observation within 15 minutes. Request a fresh status check.",
            },
      });
    } else if (request.domain === "tasks" || request.domain === "sleep") {
      // Select only the requested JSON field; journal and other state never leave PostgreSQL.
      const field = request.domain === "tasks" ? "todos" : "sleep";
      const rows = await db.$queryRaw<
        {
          items: Prisma.JsonValue;
          deleted: Prisma.JsonValue;
          updatedAt: Date;
        }[]
      >`SELECT "state" -> ${field} AS items, "state" -> 'deletedTodoIds' AS deleted, "updatedAt" FROM "UserState" WHERE "userId" = ${access.userId}`;
      const row = rows[0];
      const cutoff = new Date(Date.now() - request.days * 86400000)
        .toISOString()
        .slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const map =
        row?.items && typeof row.items === "object" && !Array.isArray(row.items)
          ? row.items
          : {};
      const deleted = new Set(Array.isArray(row?.deleted) ? row.deleted : []);
      const entries = Object.entries(map)
        .filter(
          ([day]) =>
            /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= cutoff && day <= today,
        )
        .sort(([a], [b]) => b.localeCompare(a))
        .flatMap(([day, entries]) =>
          Array.isArray(entries)
            ? entries
                .slice(0, 100)
                .map((item) => ({ day, item: item as Record<string, unknown> }))
            : [],
        )
        .slice(0, 1000);
      if (request.domain === "sleep") {
        const valid = entries.filter(
          ({ item }) =>
            item &&
            typeof item.durationMins === "number" &&
            item.durationMins > 0 &&
            item.durationMins <= 1440,
        );
        result.push({
          id: `state:sleep:${cutoff}:${today}`,
          kind: "sleep_aggregation",
          data: {
            from: cutoff,
            to: today,
            entries: valid.length,
            meanMinutes: valid.length
              ? Math.round(
                  valid.reduce((s, e) => s + Number(e.item.durationMins), 0) /
                    valid.length,
                )
              : null,
            updatedAt: row?.updatedAt,
            limitation:
              "Descriptive mean of saved entries; no causal or habit correlation analysis is available.",
          },
        });
      } else {
        const tasks = entries
          .filter(
            ({ item }) =>
              item &&
              !item.done &&
              !deleted.has(item.id as string) &&
              typeof item.text === "string" &&
              !hasSecrets(item.text) &&
              classifyLabels("work", item.text).every((l) =>
                access.labels.includes(l),
              ),
          )
          .slice(0, 8)
          .map(({ day, item }) => ({
            id: item.id,
            day,
            text: String(item.text).slice(0, 120),
          }));
        result.push({
          id: `state:tasks:${cutoff}:${today}`,
          kind: "saved_tasks",
          data: {
            tasks,
            from: cutoff,
            to: today,
            updatedAt: row?.updatedAt,
            limitation:
              "Saved server state; unsynced device changes are unavailable.",
          },
        });
      }
    }
  }
  return result;
}
