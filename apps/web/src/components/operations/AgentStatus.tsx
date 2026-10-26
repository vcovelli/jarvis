"use client";

import { useOperations } from "./OperationsProvider";
import { supervisionStatus } from "@/lib/operations/supervision";
import styles from "./Workspace.module.css";

export function AgentStatus({ domain, chat = false, action = true }: { domain?: string; chat?: boolean; action?: boolean }) {
  const { allowed, data, stale, now, open } = useOperations();
  if (!allowed) return null;
  const status = data ? supervisionStatus({ ...data, stale, now }, domain) : "Status unavailable";
  return <section className={styles.statusStrip} aria-label="Agent supervision">
    <div><strong>{domain ? `${domain} agent` : "Background agents"} · {status}</strong>
      <p>{chat ? "Discussion only · job details stay in the control room. Messages do not queue work. Chat has separate permissions and billing." : !data || stale ? "Refresh the control room to verify worker health and usage." : !data.profile ? "Set up observation, limits, and approvals in the control room." : `${data.activeCount} active / queued · ${data.pendingCount} approvals · $${(data.costs.day.reservedUsd ?? 0).toFixed(4)} / $${data.profile.dailyUsd} reserved today`}</p>
    </div>
    {action && <button onClick={() => open("Activity")}>Control room ↗</button>}
  </section>;
}
