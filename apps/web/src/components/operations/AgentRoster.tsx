"use client";

import { useState } from "react";
import { agentChatDomain, agentDomains, supervisionStatus } from "@/lib/operations/supervision";
import type { OperationsSnapshot } from "./OperationsProvider";
import styles from "./Workspace.module.css";

const missions: Record<string, string> = {
  infrastructure: "Watch service health and capacity; surface reliability issues.",
  finance: "Check financial source freshness and flag changes for review.",
  business: "Review business signals. Revenue and expense sources are not connected yet.",
  security: "Review available security signals; vulnerability scanning is not connected.",
  executive: "Summarize priorities and observations across the workspace.",
  strategy: "Review longer-term priorities against your saved business goals.",
};
const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not recorded";

export function AgentRoster({ data, stale, now, busy, queue, review }: {
  data: OperationsSnapshot; stale: boolean; now: number; busy: boolean;
  queue: (domain: string) => void; review: (domain: string) => void;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function openDiscussion(domain: string) {
    setOpening(domain); setError("");
    try {
      const response = await fetch("/api/assistant/conversations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: agentChatDomain(domain), title: `${domain} agent discussion`, description: `Discussion of the ${domain} observation agent. Chat does not authorize or queue background work. Review jobs and approvals in Operations.` }),
      });
      const result = await response.json();
      if (!response.ok || !result.conversation?.id) throw new Error(result.error || "Could not open discussion.");
      window.location.assign(`/v2/assistant?conversation=${encodeURIComponent(result.conversation.id)}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not open discussion."); setOpening(null); }
  }
  return <section aria-label="Agent roster">
    <div className="mb-3"><h2 className="font-semibold">Agents & their work</h2><p className="theme-muted mt-1 text-xs">Observation and recommendations only. Standing by means the worker is reachable; scheduled jobs run when due. Personal Plan tasks are not agent assignments.</p></div>
    {error && <p role="alert" className="mb-3 text-sm">{error}</p>}
    <div className={styles.agentGrid}>{agentDomains.map(domain => {
      const active = data.activeRuns.filter(run => run.domain === domain);
      const latest = data.runs.find(run => run.domain === domain);
      const schedule = data.schedules.find(schedule => schedule.domain === domain);
      const reasoning = data.reasoning.find(item => item.domain === domain);
      const conversations = data.conversations.filter(chat => chat.domain === agentChatDomain(domain));
      const decisions = data.decisions.filter(decision => decision.domain === domain && Date.parse(decision.expiresAt) > now && (decision.status === "pending" || (decision.status === "snoozed" && !!decision.snoozedUntil && Date.parse(decision.snoozedUntil) <= now)));
      const state = supervisionStatus({ ...data, stale, now }, domain);
      return <article key={domain} className={styles.agentCard}>
        <header><h3>{domain}</h3><span>{state}</span></header>
        <p>{missions[domain]}</p>
        <dl>
          <div><dt>Authority</dt><dd>Read-only observation</dd></div>
          <div><dt>Reasoning</dt><dd>{reasoning?.state ?? "Unknown"}</dd></div>
          <div><dt>Next scheduled check</dt><dd>{time(schedule?.nextRunAt)}</dd></div>
          <div><dt>Latest job</dt><dd>{latest ? `${latest.status} · ${time(latest.finishedAt ?? latest.startedAt ?? latest.createdAt)}` : "No jobs yet"}</dd></div>
        </dl>
        {latest?.errorCode && <p>Latest issue: {latest.errorCode.replaceAll("_", " ")}</p>}
        {active.length > 0 && <ul aria-label={`${domain} active jobs`}>{active.map(run => <li key={run.id}>
          <strong>{run.status} · attempt {run.attempts}/3</strong><p>Job {run.id} · {run.status === "running" ? `Started ${time(run.startedAt)}` : `Eligible ${time(run.availableAt)}`}</p>
        </li>)}</ul>}
        {!active.length && <p>{stale ? "Refresh to verify current work." : "No active or queued work."}</p>}
        {latest && <details><summary>Latest job usage & result</summary><p>Job {latest.id}</p><p>{latest.provider}{latest.model ? ` / ${latest.model}` : ""} · {latest.durationMs === null ? "Duration unavailable" : `${latest.durationMs} ms`}</p><p>Tokens in / out: {latest.inputTokens ?? "unknown"} / {latest.outputTokens ?? "unknown"}. Reserved: ${latest.reservedUsd.toFixed(4)}. API estimate: ${latest.apiCostUsd.toFixed(4)}. Energy estimate: ${latest.energyEstimateUsd.toFixed(6)}.</p><p>Verified revenue: {latest.verifiedRevenueUsd === null ? "Not measured" : `$${latest.verifiedRevenueUsd.toFixed(2)}`}</p></details>}
        <div className={styles.agentActions}>
          <button disabled={busy || stale || !data.profile?.enabled || data.profile.paused || active.length > 0} onClick={() => queue(domain)}>Queue check</button>
          <button onClick={() => review(domain)}>Approvals{!stale ? ` · ${decisions.length}` : ""}</button>
          <button disabled={!!opening} onClick={() => void openDiscussion(domain)}>{opening === domain ? "Opening…" : "New discussion"}</button>
        </div>
        <details><summary>Linked discussions · {conversations.length}</summary>
          <p>These threads discuss this agent. They do not run as the background worker or inherit its budget. Latest 80 agent discussions are shown.</p>
          <ul>{conversations.map(chat => <li key={chat.id}><a href={`/v2/assistant?conversation=${encodeURIComponent(chat.id)}`}>{chat.title} ↗</a></li>)}</ul>
          {!conversations.length && <p>No linked discussions yet.</p>}
        </details>
      </article>;
    })}</div>
  </section>;
}
