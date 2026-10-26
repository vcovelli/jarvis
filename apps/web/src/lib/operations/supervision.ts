/** Shared labels and status derivation; no model calls or execution authority. */
export const agentDomains = ["infrastructure", "finance", "business", "security", "executive", "strategy"] as const;
export const agentChatDomain = (domain: string) => `agent-${domain}`;
export function agentFromChat(domain: string) {
  return agentDomains.find(agent => agentChatDomain(agent) === domain);
}

type Run = { domain: string; status: string; errorCode?: string | null };
type SupervisionInput = {
  stale: boolean;
  now: number;
  profile: { enabled: boolean; paused: boolean; workerSeenAt: string | null; dailyUsd: number; monthlyUsd: number } | null;
  costs: { day: { reservedUsd: number | null }; month: { reservedUsd: number | null } };
  activeRuns: Run[];
};

export function supervisionStatus(data: SupervisionInput, domain?: string) {
  const { profile: p, now, stale } = data;
  if (stale) return "Status unavailable";
  if (!p) return "Not configured";
  if (!p.enabled || p.paused) return "Paused";
  const heartbeat = p.workerSeenAt ? Date.parse(p.workerSeenAt) : NaN;
  if (!Number.isFinite(heartbeat) || now - heartbeat >= 300_000 || heartbeat > now + 60_000) return "Worker offline";
  const runs = data.activeRuns.filter(run => !domain || run.domain === domain);
  if (runs.some(run => run.status === "running")) return "Running";
  if ((data.costs.day.reservedUsd ?? 0) >= p.dailyUsd || (data.costs.month.reservedUsd ?? 0) >= p.monthlyUsd) return "Budget reached";
  if (runs.some(run => run.status === "retry")) return "Retry scheduled";
  if (runs.some(run => run.status === "queued")) return "Queued";
  return "Standing by";
}
