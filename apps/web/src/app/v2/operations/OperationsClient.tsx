"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Collection } from "@/lib/operations/collectors";
import type { Preferences } from "@/lib/operations/policy";
import SystemStatusPanel from "./SystemStatusPanel";

import { useOperations, type OperationsSnapshot as Snapshot, type AgentView } from "@/components/operations/OperationsProvider";
import styles from "@/components/operations/Workspace.module.css";

type Decision = Snapshot["decisions"][number];
const cadenceLabels: Record<string, string> = { infrastructure: "Every 30 minutes", security: "Every 30 minutes", finance: "Daily + finance sync", business: "Daily", executive: "Daily", strategy: "Weekly" };
const domains = [
  "infrastructure",
  "finance",
  "business",
  "security",
  "executive",
  "strategy",
];
const tabs = [
  "System",
  "Overview",
  "Decisions",
  "Activity",
  "History",
  "Preferences",
] as const;
const labels = { System: "System", Overview: "Briefing", Decisions: "Approvals", Activity: "Agents", History: "History", Preferences: "Settings" };
const button =
  "theme-button-secondary min-h-11 rounded-xl px-4 py-2 text-sm disabled:opacity-40";
const card = "theme-card rounded-2xl p-4";
const input =
  "theme-input mt-1 w-full rounded-xl border border-white/15 bg-transparent p-3";
const time = (v: string | null) =>
  v ? new Date(v).toLocaleString() : "Unavailable";
const money = (n: number | null | undefined) => `$${(n ?? 0).toFixed(6)}`;
function Data({ value }: { value: unknown }) {
  return (
    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/10 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function OperationsClient({ embedded = false, initialTab }: { embedded?: boolean; initialTab?: AgentView }) {
  const { data, refresh, error: loadError, stale, allowed, now } = useOperations();
  const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab ?? "System");
  const [selected, setSelected] = useState<string | null>(null);
  const [domain, setDomain] = useState("all");
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (embedded) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("decision");
    const requested = params.get("view");
    if (requested && tabs.some(t => t.toLowerCase() === requested.toLowerCase())) setTab(tabs.find(t => t.toLowerCase() === requested.toLowerCase())!);
    if (id) { setSelected(id); setTab("Decisions"); }
  }, [embedded]);
  function navigate(next: (typeof tabs)[number]) {
    setTab(next); setSelected(null);
    if (!embedded) window.history.replaceState(null, "", `/v2/operations?view=${next.toLowerCase()}`);
  }
  async function mutate(body: unknown, decisionId?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(
        decisionId
          ? `/api/operations/decisions/${encodeURIComponent(decisionId)}`
          : "/api/operations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Operation failed.");
      await refresh(true);
      setNotice(
        "Saved. Any queued work still requires an active observation loop and worker.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy(false);
    }
  }
  const p = data?.profile;
  const decision = data?.decisions.find((d) => d.id === selected);
  const visibleTabs = embedded ? tabs.filter(t => t !== "System") : tabs;
  const decisionList = data?.decisions.filter(d => {
    const expired = Date.parse(d.expiresAt) <= now && ["pending", "snoozed"].includes(d.status);
    const needsReview = !expired && (d.status === "pending" || (d.status === "snoozed" && !!d.snoozedUntil && Date.parse(d.snoozedUntil) <= now));
    return (domain === "all" || d.domain === domain) && (status === "all" || (status === "pending" ? needsReview : status === "expired" ? expired : !expired && d.status === status)) && `${d.title} ${d.domain}`.toLowerCase().includes(query.toLowerCase());
  }) ?? [];
  if (!allowed) return <p role="alert" className="p-4">Administrator access is required for the agent workspace.</p>;
  return (
    <div className={`${styles.workspace} mx-auto w-full max-w-6xl space-y-4 px-4 py-5 pb-12 sm:px-6`}>
      <header className={styles.header}>
        {!embedded && <div><p className={styles.eyebrow}>Covelli server</p><h1>Operations</h1></div>}
        <div className={styles.toolbar}>
          <label className={styles.viewSelect}>View<select aria-label="Operations view" value={tab} onChange={e => navigate(e.target.value as typeof tab)}>{visibleTabs.map(t => <option key={t} value={t}>{labels[t]}{t === "Decisions" && data?.pendingCount ? ` (${data.pendingCount})` : ""}</option>)}</select></label>
          <button className={button} disabled={busy} onClick={() => void refresh()}>Refresh</button>
          {p && <button className={button} disabled={busy || (stale && (p.paused || !p.enabled))} onClick={() => void mutate({ operation: "settings", settings: p.paused || !p.enabled ? { enabled: true, paused: false } : { paused: true } })}>{p.paused || !p.enabled ? "Enable observation loop" : "Emergency pause"}</button>}
        </div>
      </header>
      <nav aria-label="Operations sections" className={styles.nav}>{visibleTabs.map(t => <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => navigate(t)}>{labels[t]}{t === "Decisions" && data?.pendingCount ? ` · ${data.pendingCount}` : ""}</button>)}</nav>
      {loadError && <p role="alert" className="theme-card rounded-xl p-3 text-sm">{loadError} Previously loaded records may be out of date.</p>}
      {tab === "System" && <>
        <SystemStatusPanel />
        <section className={styles.banner}><div><strong>{data?.pendingCount ? `${data.pendingCount} recommendations need your review` : "Observation → recommendation → your decision"}</strong><p>Review agent evidence, authorize a specific recheck, then follow the result.</p></div><button onClick={() => navigate("Decisions")}>Open approvals →</button></section>
      </>}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/40 p-3 text-sm"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="theme-muted text-sm">
          {notice}
        </p>
      )}
      {tab !== "System" && (!data ? (
        <p role="status">Loading Operations…</p>
      ) : !p ? (
        <section className={card}>
          <h2 className="font-semibold">Start with read-only observation</h2>
          <p className="theme-muted my-3">
            Create your private agent workspace with budgets, quiet hours, and an approval inbox. Observation starts paused. The Agents view shows whether a worker is connected.
          </p>
          <button
            className={button}
            disabled={busy}
            onClick={() => void mutate({ operation: "initialize" })}
          >
            Initialize Operations
          </button>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>
              {p.paused || !p.enabled ? "Paused" : "Observation enabled"} ·
              Consequential execution disabled
            </span>
            <span className="theme-muted">
              {p.workerSeenAt &&
              Date.parse(data.generatedAt) - Date.parse(p.workerSeenAt) <
                5 * 60000
                ? "Worker checked in recently"
                : "Worker not seen in the last 5 minutes"}
            </span>
          </div>
          {tab === "Overview" && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Summary
                  title="Overall health"
                  value={
                    domains
                      .slice(0, 4)
                      .some(
                        (domain) =>
                          !data.observations.some((o) => o.domain === domain),
                      )
                      ? "Incomplete coverage"
                      : data.observations.some(
                            (o) =>
                              Date.parse(data.generatedAt) -
                                Date.parse(o.createdAt) >
                              (o.domain === "infrastructure" ||
                              o.domain === "security"
                                ? 3600000
                                : 36 * 3600000),
                          )
                        ? "Some data stale"
                        : data.observations.some((o) => o.severity !== "info")
                          ? "Needs review"
                          : "No detected alerts"
                  }
                />
                <Summary
                  title="Pending decisions"
                  value={String(data.pendingCount)}
                />
                <Summary
                  title="Active / queued jobs"
                  value={String(data.activeCount)}
                />
                <Summary
                  title="Month estimated energy"
                  value={money(data.costs.month.energyEstimateUsd)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {domains.slice(0, 4).map((domain) => {
                  const o = data.observations.find((o) => o.domain === domain),
                    c = o?.data as unknown as Collection | undefined;
                  return (
                    <section key={domain} className={card}>
                      <div className="flex justify-between gap-2">
                        <h2 className="font-semibold capitalize">{domain}</h2>
                        <span className="theme-muted text-xs">
                          {o
                            ? o.severity === "info"
                              ? "Observed"
                              : "Review"
                            : "Unknown"}
                        </span>
                      </div>
                      <p className="theme-muted mt-1 text-xs">
                        {o ? time(o.createdAt) : "No observation yet"}
                      </p>
                      <p className="mt-2 text-sm">
                        {domain === "finance"
                          ? c
                            ? c.metrics.stale
                              ? "Financial sources stale or missing"
                              : `Source freshness: ${time(c.sourceUpdatedAt)}`
                            : "Financial freshness unknown"
                          : domain === "business"
                            ? "Revenue and expenses not connected"
                            : domain === "security"
                              ? "Limited signals; vulnerability scanning unavailable"
                              : (c?.signals[0]?.title ??
                                "Disk, memory, CPU load, optional service and backup checks")}
                      </p>
                      {c && (
                        <details className="mt-3 text-sm">
                          <summary className="cursor-pointer">
                            Evidence and limits
                          </summary>
                          <Briefing collection={c} />
                        </details>
                      )}
                    </section>
                  );
                })}
              </div>
              <section className={card}>
                <h2 className="font-semibold">Alerts & briefings</h2>
                <div className="mt-3 space-y-2">
                  {data.notifications
                    .filter((n) => !n.readAt)
                    .slice(0, 5)
                    .map((n) => (
                      <article
                        key={n.id}
                        className="rounded-xl border border-white/10 p-3"
                      >
                        <p className="text-xs uppercase">
                          {n.severity} · {n.source}
                        </p>
                        <p className="mt-1 font-medium">{n.title}</p>
                        <p className="theme-muted text-xs">
                          {time(n.createdAt)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {n.decisionId && (
                            <a
                              className={button}
                              href={`/v2/operations?decision=${n.decisionId}`}
                              onClick={(e) => {
                                e.preventDefault();
                                setSelected(n.decisionId);
                                setTab("Decisions");
                              }}
                            >
                              Review decision
                            </a>
                          )}
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              void mutate({
                                operation: "read",
                                notificationId: n.id,
                              })
                            }
                          >
                            Mark read
                          </button>
                        </div>
                      </article>
                    ))}
                  {!data.notifications.some((n) => !n.readAt) && (
                    <p className="theme-muted text-sm">
                      No unread alerts. Quiet hours defer alerts in this inbox.
                    </p>
                  )}
                </div>
              </section>
              <section className={card}>
                <h2 className="font-semibold">Daily executive summary</h2>
                {data.observations.find((o) => o.domain === "executive") ? (
                  <Briefing collection={data.observations.find(o => o.domain === "executive")!.data as unknown as Collection} />
                ) : (
                  <p className="theme-muted mt-2 text-sm">
                    Awaiting the first daily summary.
                  </p>
                )}
              </section>
              <section className={card}>
                <h2 className="font-semibold">Recent verified actions</h2>
                {data.executions.slice(0, 3).map((e) => (
                  <p key={e.id} className="mt-2 text-sm">
                    Read-only recheck persisted · {time(e.verifiedAt)}
                  </p>
                ))}
                {!data.executions.length && (
                  <p className="theme-muted mt-2 text-sm">
                    No approved actions have completed.
                  </p>
                )}
              </section>
            </>
          )}
          {tab === "Decisions" && <details className={card}><summary>Notification inbox · {data.notifications.filter(n => !n.readAt).length} unread</summary><p className="theme-muted mb-3 text-xs">Latest 30 delivered alerts. Quiet hours delay delivery; unread alerts stay here.</p><div className="space-y-2">{data.notifications.map(n => <article key={n.id} className="rounded-xl border border-white/10 p-3"><p className="theme-muted text-xs">{n.source} · {n.severity} · {time(n.createdAt)}{n.readAt ? " · Read" : " · Unread"}</p><h3 className="my-2 text-sm font-medium">{n.title}</h3><div className="flex flex-wrap gap-2">{n.decisionId && <button className={button} onClick={() => setSelected(n.decisionId)}>Review decision</button>}{!n.readAt && <button className={button} disabled={busy || stale} onClick={() => void mutate({ operation: "read", notificationId: n.id })}>Mark read</button>}</div></article>)}{!data.notifications.length && <p className="theme-muted text-sm">No delivered notifications yet.</p>}</div></details>}
          {tab === "Decisions" &&
            (decision ? (
              <DecisionDetail
                key={decision.id}
                decision={decision}
                busy={busy || stale}
                paused={p.paused || !p.enabled}
                now={now}
                mutate={mutate}
                onBack={() => setSelected(null)}
                outcomes={data.outcomes.filter(
                  (o) => o.decisionId === decision.id,
                )}
              />
            ) : (
              <section className="space-y-3">
                {selected && (
                  <p role="status">
                    This decision is not in the latest 100 records.
                  </p>
                )}
                <div className={styles.filters}>
                  <label>Search<input type="search" placeholder="Find a recommendation…" value={query} onChange={e => setQuery(e.target.value)} /></label>
                  <label>Agent<select value={domain} onChange={e => setDomain(e.target.value)}><option value="all">All agents</option>{domains.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
                  <label>Status<select value={status} onChange={e => setStatus(e.target.value)}>{[["pending", "Needs review"], ["all", "All decisions"], ["approved", "Approved"], ["rejected", "Denied"], ["snoozed", "Snoozed"], ["expired", "Expired"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
                <p className="theme-muted text-xs">Latest 100 decisions. Approval authorizes only the action shown, once, before its expiry.</p>
                {decisionList.map((d) => (
                  <button
                    key={d.id}
                    className={`${card} w-full text-left`}
                    onClick={() => setSelected(d.id)}
                  >
                    <span className="theme-muted text-xs uppercase">
                      {d.domain} · {d.severity} ·{" "}
                      {Date.parse(d.expiresAt) <=
                        Date.parse(data.generatedAt) &&
                      ["pending", "snoozed"].includes(d.status)
                        ? "expired"
                        : d.status}
                    </span>
                    <span className="mt-1 block font-semibold">{d.title}</span>
                    <span className="theme-muted mt-1 block text-xs">
                      Review by {time(d.expiresAt)}
                      {d.snoozedUntil
                        ? ` · Snoozed until ${time(d.snoozedUntil)}`
                        : ""}
                    </span>
                  </button>
                ))}
                {!decisionList.length && (
                  <p className={card}>
                    No matching decisions. New recommendations appear here when an agent finds a meaningful signal.
                  </p>
                )}
              </section>
            ))}
          {tab === "Activity" && (
            <>
              <AgentDoctor data={data} stale={stale} now={now} />
              <section className={card}>
                <h2 className="font-semibold">Usage & budget</h2>
                <p className="theme-muted mt-2 text-sm">{data.modelStatus}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt>Day reserved / cap</dt>
                    <dd>
                      {money(data.costs.day.reservedUsd)} / ${p.dailyUsd}
                    </dd>
                  </div>
                  <div>
                    <dt>Month reserved / cap</dt>
                    <dd>
                      {money(data.costs.month.reservedUsd)} / ${p.monthlyUsd}
                    </dd>
                  </div>
                  <div>
                    <dt>Month API cost estimate</dt>
                    <dd>{money(data.costs.month.apiCostUsd)}</dd>
                  </div>
                  <div>
                    <dt>Local energy estimate</dt>
                    <dd>{money(data.costs.month.energyEstimateUsd)}</dd>
                  </div>
                </dl>
                <p className="theme-muted mt-3 text-xs">
                  Energy uses {p.assumedWatts} W × duration × $
                  {p.electricityRate}/kWh. Whole-host assumption, not hardware
                  measurement or measured GPU energy. Reservations include
                  failed attempts. Attributable revenue and profitability are
                  unknown.
                </p>
              </section>
              <section className={card}>
                <h2 className="font-semibold">Agents & schedules</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {data.schedules.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-white/10 p-3"
                    >
                      <p className="font-medium capitalize">{s.domain}</p>
                      <p className="theme-muted my-2 text-xs">
                        {cadenceLabels[s.domain]} · Next due {time(s.nextRunAt)}
                      </p>
                      <button
                        className={button}
                        disabled={busy || p.paused || !p.enabled}
                        onClick={() =>
                          void mutate({ operation: "run", domain: s.domain })
                        }
                      >
                        Queue analysis
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className={card}>
                <h2 className="font-semibold">Recent jobs</h2>
                {data.runs.map((r) => (
                  <details
                    key={r.id}
                    className="mt-3 border-t border-white/10 pt-3"
                  >
                    <summary className="cursor-pointer text-sm">
                      {r.domain} · {r.status} · attempt {r.attempts}/3
                    </summary>
                    <p className="theme-muted mt-2 text-xs">
                      {time(r.createdAt)} · {r.durationMs ?? 0} ms ·{" "}
                      {r.provider}
                      {r.model ? ` / ${r.model}` : ""} · estimated API{" "}
                      {money(r.apiCostUsd)} · estimated energy{" "}
                      {money(r.energyEstimateUsd)}
                    </p>
                    <p className="theme-muted text-xs">
                      Tokens in/out: {r.inputTokens ?? "unknown"} /{" "}
                      {r.outputTokens ?? "unknown"} · Local inference:{" "}
                      {r.localInferenceMs === null
                        ? "not used"
                        : `${r.localInferenceMs} ms`}
                    </p>
                    <p className="text-xs">
                      {r.errorCode ?? "No failure recorded"}
                      {r.status === "retry"
                        ? ` · Retry after ${time(r.availableAt)}`
                        : ""}
                    </p>
                  </details>
                ))}
              </section>
            </>
          )}
          {tab === "History" && (
            <section className={card}>
              <h2 className="font-semibold">Operations audit timeline</h2>
              <p className="theme-muted mt-1 text-xs">
                Latest 50 events. Full history remains in PostgreSQL.
              </p>
              <ol className="mt-3 space-y-3">
                {data.history.map((h) => (
                  <li key={h.id} className="border-l-2 border-cyan-500/40 pl-3">
                    <p className="text-sm">
                      {h.action.replace("operations.", "").replaceAll("_", " ")}{" "}
                      · {h.outcome}
                    </p>
                    <p className="theme-muted text-xs">{time(h.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {tab === "Preferences" && (
            <PreferencesForm
              key={p.userId}
              profile={p}
              busy={busy || stale}
              save={(settings) => mutate({ operation: "settings", settings })}
            />
          )}
        </>
      ))}
    </div>
  );
}
function Summary({ title, value }: { title: string; value: string }) {
  return (
    <section className={card}>
      <h2 className="theme-muted text-xs">{title}</h2>
      <p className="mt-2 break-words text-lg font-semibold">{value}</p>
    </section>
  );
}
function DecisionDetail({
  decision: d,
  busy,
  now,
  paused,
  mutate,
  onBack,
  outcomes,
}: {
  decision: Decision;
  busy: boolean;
  now: number;
  paused: boolean;
  mutate: (b: unknown, id?: string) => Promise<void>;
  onBack: () => void;
  outcomes: Snapshot["outcomes"];
}) {
  const [confirm, setConfirm] = useState<{ hash: string; expiresAt: string } | null>(null);
  const b = d.brief as Record<string, unknown>;
  const advisory = b.advisoryReasoning as Collection["reasoning"] | null;
  const eligible =
    ["pending", "snoozed"].includes(d.status) && Date.parse(d.expiresAt) > now;
  function outcome(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void mutate(
      {
        operation: "outcome",
        observedResult: f.get("result"),
        variance: f.get("variance"),
        quality: f.get("quality"),
      },
      d.id,
    );
  }
  return (
    <article className={`${card} space-y-4`}>
      <button className={button} onClick={onBack}>
        Back to inbox
      </button>
      <div>
        <p className="theme-muted text-xs uppercase">
          {d.domain} · {d.status}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{d.title}</h2>
        <p className="mt-2 text-sm">{String(b.whyItMatters)}</p>
      </div>
      <p className="text-sm">{String(b.recommendation)}</p>
      {advisory?.summary && <section className="rounded-xl border border-cyan-400/20 p-4"><h3 className="text-sm font-semibold">AI perspective</h3><p className="mt-2 text-sm">{advisory.summary}</p>{advisory.uncertainty?.length > 0 && <details className="mt-2 text-sm"><summary>Uncertainty</summary><ul className="theme-muted space-y-2">{advisory.uncertainty.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}<p className="theme-muted mt-2 text-xs">{advisory.provider} · {advisory.model} · advisory only</p></section>}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["Confidence", b.confidence],
          ["Source", b.source],
          ["Source freshness", time(b.sourceUpdatedAt as string | null)],
          ["Expected upside", b.expectedUpside],
          ["Cost of doing nothing", b.costOfDoingNothing],
          ["Cost", b.cost],
          ["Authorization", b.authorization],
          ["Forecast", b.forecast],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <h3 className="theme-muted text-xs">{String(label)}</h3>
            <p className="mt-1 text-sm">{String(value)}</p>
          </div>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer">
          Original evidence, assumptions, uncertainty & alternatives
        </summary>
        <Data
          value={{
            evidence: b.evidence,
            assumptions: b.assumptions,
            uncertainty: b.uncertainty,
            downside: b.downside,
            alternatives: b.alternatives,
            originalPreferences: b.preferencesAtRecommendation,
            advisoryReasoning: b.advisoryReasoning,
          }}
        />
      </details>
      <section className="rounded-xl border border-cyan-400/30 p-3">
        <h3 className="font-medium">Exact proposed action</h3>
        <p className="mt-2 text-sm">Collect a fresh {d.domain} observation and attach the result to this recommendation.</p>
        <details><summary className="text-xs">Action parameters</summary><Data value={d.action} /></details>
        <p className="mt-2 text-xs">
          Expires {time(d.expiresAt)}. No financial, network, security,
          messaging, or deployment action is authorized.
        </p>
      </section>
      {eligible && paused && <p className="theme-muted text-sm">Observation is paused. Resume the loop before approving a recheck. You can still deny or snooze this recommendation.</p>}
      {eligible && (
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={busy || paused}
            onClick={() => setConfirm({ hash: d.actionHash, expiresAt: d.expiresAt })}
          >
            Review approval
          </button>
          <button
            className={button}
            disabled={busy}
            onClick={() => void mutate({ operation: "reject" }, d.id)}
          >
            Deny
          </button>
          <button
            className={button}
            disabled={busy}
            onClick={() => void mutate({ operation: "analyze" }, d.id)}
          >
            Request fresh analysis
          </button>
          <button
            className={button}
            disabled={busy}
            onClick={() => void mutate({ operation: "snooze" }, d.id)}
          >
            Snooze 24 hours
          </button>
        </div>
      )}
      {confirm && confirm.hash === d.actionHash && confirm.expiresAt === d.expiresAt && eligible && (
        <div className="rounded-xl border border-amber-400/40 p-4">
          <p className="text-sm">
            Approve one read-only recheck of this exact action before{" "}
            {time(d.expiresAt)}?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={button}
              disabled={busy || paused}
              onClick={() => {
                setConfirm(null);
                void mutate(
                  { operation: "approve", actionHash: confirm.hash },
                  d.id,
                );
              }}
            >
              Approve this recheck
            </button>
            <button className={button} onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <details>
        <summary className="cursor-pointer">Record actual outcome</summary>
        <form onSubmit={outcome} className="mt-3 space-y-3">
          <label className="block text-sm">
            Observed result (user reported)
            <textarea
              name="result"
              required
              maxLength={2000}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Variance from original forecast
            <textarea
              name="variance"
              required
              maxLength={2000}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Decision quality, independent of luck
            <select name="quality" className={input}>
              <option value="uncertain">Uncertain</option>
              <option value="sound">Sound process</option>
              <option value="unsound">Unsound process</option>
            </select>
          </label>
          <button className={button} disabled={busy}>
            Save outcome review
          </button>
        </form>
      </details>
      {outcomes.map((o) => (
        <section key={o.id} className="border-t border-white/10 pt-3">
          <p className="text-sm">{o.observedResult}</p>
          <p className="theme-muted text-xs">
            Variance: {o.variance} · Quality: {o.quality} · {time(o.createdAt)}
          </p>
        </section>
      ))}
    </article>
  );
}
function PreferencesForm({
  profile,
  busy,
  save,
}: {
  profile: NonNullable<Snapshot["profile"]>;
  busy: boolean;
  save: (settings: unknown) => Promise<void>;
}) {
  const p = profile.preferences as unknown as Preferences;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const preferences = { ...p } as Preferences;
    for (const k of [
      "financialGoals",
      "investmentHorizon",
      "riskTolerance",
      "businessPriorities",
      "reliability",
      "temporary",
      "timezone",
    ] as const)
      preferences[k] = String(f.get(k));
    for (const k of [
      "liquidityUsd",
      "monthlySpendingUsd",
      "quietStart",
      "quietEnd",
    ] as const)
      preferences[k] = Number(f.get(k));
    preferences.temporaryExpiresAt = f.get("temporaryExpiresAt")
      ? new Date(String(f.get("temporaryExpiresAt")) + ":00Z").toISOString()
      : null;
    const settings: Record<string, unknown> = { preferences };
    for (const k of [
      "perJobUsd",
      "dailyUsd",
      "monthlyUsd",
      "assumedWatts",
      "electricityRate",
    ])
      settings[k] = Number(f.get(k));
    void save(settings);
  }
  const textField = (key: keyof Preferences, label: string) => <label className="block text-sm" key={key}>{label}<input name={key} defaultValue={String(p[key])} maxLength={1000} required className={input} /></label>;
  const numberField = (key: string, label: string, value: number, max: number, step = "any") => <label className="block text-sm" key={key}>{label}<input name={key} type="number" defaultValue={value} min={0} max={max} step={step} required className={input} /></label>;
  return <form onSubmit={submit} className={`${card} space-y-4`}>
    <div><h2 className="font-semibold">Workflow settings</h2><p className="theme-muted mt-1 text-sm">Customize priorities, interruptions, and operating limits.</p></div>
    <details open className="border-t border-white/10"><summary className="font-medium">Notifications & quiet hours</summary><div className="grid gap-4 sm:grid-cols-2">
      {textField("timezone", "Notification timezone")}
      <div className="text-sm"><p>Delivery channel</p><p className="theme-muted mt-3">Jarvis inbox · notifications appear while Jarvis is open</p></div>
      {numberField("quietStart", "Quiet hours start (0–23)", p.quietStart, 23, "1")}
      {numberField("quietEnd", "Quiet hours end (0–23)", p.quietEnd, 23, "1")}
    </div><p className="theme-muted mt-3 text-xs">Equal start and end disables quiet hours. Email, SMS and background phone push are not connected. Changes apply to new notifications.</p></details>
    <details className="border-t border-white/10"><summary className="font-medium">Budgets & energy assumptions</summary><div className="grid gap-4 sm:grid-cols-2">
      {numberField("perJobUsd", "Per-job cap (USD)", profile.perJobUsd, 10)}
      {numberField("dailyUsd", "Daily cap (USD, UTC)", profile.dailyUsd, 100)}
      {numberField("monthlyUsd", "Monthly cap (USD, UTC)", profile.monthlyUsd, 1000)}
      {numberField("assumedWatts", "Assumed whole-host power (W)", profile.assumedWatts, 2000)}
      {numberField("electricityRate", "Electricity assumption (USD/kWh)", profile.electricityRate, 10)}
    </div><p className="theme-muted mt-3 text-xs">Per-job ≤ daily ≤ monthly. These caps cover the observation loop, including optional reasoning. Interactive chat usage is separate. Energy is estimated from these assumptions; live UPS/GPU readings are in Operations.</p></details>
    <details className="border-t border-white/10"><summary className="font-medium">Goals & recommendation preferences</summary><div className="grid gap-4 sm:grid-cols-2">
      {textField("financialGoals", "Financial goals")}{textField("investmentHorizon", "Investment horizon")}{textField("riskTolerance", "Risk tolerance")}{textField("businessPriorities", "Business priorities")}{textField("reliability", "Reliability preference")}
      {numberField("liquidityUsd", "Liquidity floor (USD)", p.liquidityUsd, 1e9)}
      {numberField("monthlySpendingUsd", "Monthly spending preference (USD)", p.monthlySpendingUsd, 1e9)}
    </div></details>
    <details className="border-t border-white/10"><summary className="font-medium">Temporary priorities</summary><label className="block text-sm">Priorities<textarea name="temporary" defaultValue={p.temporary} maxLength={1000} className={input} /></label><label className="mt-3 block text-sm">Expires (UTC, within 90 days)<input type="datetime-local" name="temporaryExpiresAt" defaultValue={p.temporaryExpiresAt?.slice(0, 16) ?? ""} className={input} /></label></details>
    <details className="border-t border-white/10"><summary className="font-medium">Action permissions</summary><p className="theme-muted text-sm">Each approval authorizes one exact, expiring read-only recheck. Changes to infrastructure, money, messaging, and deployments have no executor connected here. Preferences cannot grant those permissions. Interactive Assistant uses its separate gateway policy.</p></details>
    <button className={button} disabled={busy}>Save preferences</button>
  </form>;
}

function Briefing({ collection }: { collection: Collection }) {
  return <div className="mt-3 space-y-3 text-sm">
    {collection.reasoning?.summary && <p>{collection.reasoning.summary}</p>}
    {collection.signals.map(signal => <div key={signal.code}><p className="font-medium">{signal.title}</p><p className="theme-muted mt-1">{signal.detail}</p></div>)}
    {!collection.signals.length && !collection.reasoning?.summary && <p className="theme-muted">No new signals in this observation.</p>}
    <details><summary>Sources & limitations</summary><ul className="theme-muted space-y-2">{collection.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul><p className="theme-muted mt-2">{collection.source} · {time(collection.sourceUpdatedAt)}</p></details>
  </div>;
}
function AgentDoctor({ data, stale, now }: { data: Snapshot; stale: boolean; now: number }) {
  const p = data.profile;
  const workerFresh = !stale && !!p?.workerSeenAt && now - Date.parse(p.workerSeenAt) < 300000;
  const checks = [
    ["Observation loop", p?.enabled && !p.paused ? "Enabled" : "Paused", "Scheduled observations and approved rechecks use this loop. Emergency pause cancels queued and running work."],
    ["Worker heartbeat", workerFresh ? "Recent" : "Not confirmed", p?.workerSeenAt ? `Last check-in ${time(p.workerSeenAt)}. A recent heartbeat is required to process queued work.` : "No worker has checked in. Enabling the loop alone does not install or start a worker."],
    ["Approval policy", "Exact action only", "Review → approve or deny → verified result. Only read-only observation rechecks are connected to this queue. Interactive chat has a separate gateway policy."],
    ["Notifications", "In-app inbox", "Alerts appear across Jarvis while it is open. Quiet hours apply. Email, SMS, and background phone push are not connected."],
    ["Budget", p ? `$${p.dailyUsd}/day` : "Not set", "Per-job, daily and monthly caps apply to the observation loop. Interactive Assistant provider usage is separate."],
  ];
  return <section className={styles.doctor}><h2>Workflow doctor</h2><p className="theme-muted mt-1 text-xs">Connection and policy checks · refresh to check again</p>
    {checks.map(([title, state, description]) => <div key={title} className={styles.doctorRow}><div><span>{title}</span><p>{description}</p></div><strong>{state}</strong></div>)}
    {data.reasoning?.map(item => <div key={item.domain} className={styles.doctorRow}><div><span className="capitalize">{item.domain} reasoning</span><p>{item.detail}</p></div><strong>{item.state}</strong></div>)}
  </section>;
}
