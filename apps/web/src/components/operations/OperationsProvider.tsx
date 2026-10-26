"use client";
import { trapDialogFocus } from "@/lib/dialogFocus";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { snapshot } from "@/lib/operations/engine";
import styles from "./Workspace.module.css";

type Wire<T> = T extends Date ? string : T extends (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
export type OperationsSnapshot = Wire<Awaited<ReturnType<typeof snapshot>>>;
export type AgentView = "Decisions" | "Activity" | "Preferences" | "History" | "Overview";
const OperationsClient = dynamic(() => import("@/app/v2/operations/OperationsClient"), { loading: () => <p role="status">Opening agent workspace…</p> });
const Context = createContext<{
  allowed: boolean; data: OperationsSnapshot | null; error: string; stale: boolean; now: number;
  refresh: (afterWrite?: boolean) => Promise<void>; open: (view?: AgentView) => void;
}>({ allowed: false, data: null, error: "", stale: true, now: 0, refresh: async () => {}, open: () => {} });
export const useOperations = () => useContext(Context);

export function OperationsProvider({ canAdmin, children }: { canAdmin: boolean; children: ReactNode }) {
  const [data, setData] = useState<OperationsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [allowed, setAllowed] = useState(canAdmin);
  const [received, setReceived] = useState(0);
  const [now, setNow] = useState(0);
  const [view, setView] = useState<AgentView | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async (afterWrite = false) => {
    if (!allowed) return;
    if (request.current) { await request.current; if (!afterWrite) return; }
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 10000);
    request.current = (async () => {
      try {
        const response = await fetch("/api/operations", { cache: "no-store", signal: abort.signal });
        if ([401, 403].includes(response.status)) { setData(null); setAllowed(false); setView(null); }
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Agent workspace is unavailable.");
        if (!abort.signal.aborted) { setData(body); setReceived(Date.now()); setNow(Date.now()); setError(""); }
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Agent workspace is unavailable.");
        else setError("Agent workspace timed out. Retrying automatically.");
      } finally { clearTimeout(timeout); request.current = null; controller.current = null; }
    })();
    return request.current;
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    void refresh();
    const visible = () => { if (!document.hidden) { setNow(Date.now()); void refresh(); } };
    const interval = setInterval(visible, 15000);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(interval); controller.current?.abort(); window.removeEventListener("online", visible); document.removeEventListener("visibilitychange", visible); };
  }, [allowed, refresh]);
  useEffect(() => {
    if (view && !dialog.current?.open) dialog.current?.showModal();
    if (!view && dialog.current?.open) dialog.current?.close();
  }, [view]);
  const stale = Boolean(error) || !received || now - received > 45000;
  const alerts = stale ? [] : data?.notifications.filter(n => !n.readAt && !dismissed.includes(n.id)) ?? [];
  const open = useCallback((next: AgentView = "Activity") => setView(next), []);
  return <Context.Provider value={{ allowed, data, error, stale, now, refresh, open }}>
    {children}
    {allowed && alerts.length > 0 && !view && <aside className={styles.prompt} aria-label="Agent notifications">
      <div role="status"><strong>{alerts.length} agent {alerts.length === 1 ? "notification" : "notifications"}</strong><p>{alerts[0].title}</p></div>
      <button onClick={() => open("Decisions")}>Review</button>
      <button aria-label="Dismiss notification prompt" onClick={() => setDismissed(old => [...old, ...alerts.map(n => n.id)])}>×</button>
    </aside>}
    <dialog onKeyDown={trapDialogFocus} ref={dialog} className={styles.dialog} aria-labelledby="agent-workspace-title" onCancel={() => setView(null)} onClose={() => setView(null)} onClick={event => { if (event.target === dialog.current) setView(null); }}>
      {view && <div className={styles.dialogBody}>
        <header className={styles.dialogHeader}><div><p className={styles.eyebrow}>Jarvis agents</p><h2 id="agent-workspace-title">Your control room</h2></div><button autoFocus onClick={() => setView(null)} aria-label="Close agent workspace">Close</button></header>
        <OperationsClient key={view} embedded initialTab={view} />
      </div>}
    </dialog>
  </Context.Provider>;
}

export function AgentWorkspaceButton({ compact = false, beforeOpen }: { compact?: boolean; beforeOpen?: () => void }) {
  const { allowed, data, open, stale } = useOperations();
  if (!allowed) return null;
  return <button className={styles.agentButton} onClick={() => { beforeOpen?.(); open("Activity"); }} aria-label="Open agent workspace" title="Agent workspace">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
    {!compact && <span>Agents & inbox</span>}
    {!stale && !!data?.pendingCount && <span className={styles.badge}>{data.pendingCount}</span>}
  </button>;
}
