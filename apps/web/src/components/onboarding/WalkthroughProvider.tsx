"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { useJarvisState } from "@/lib/jarvisStore";
import { findGuide, guideForPath, type UserGuide } from "@/lib/userGuides";
import {
  freshProgress, parseProgress, recordGuide, resumeStep, shouldSuggest, walkthroughKey,
  WALKTHROUGH_REPLAY_EVENT, type WalkthroughProgress,
} from "@/lib/walkthroughProgress";
import { WalkthroughDialog } from "./WalkthroughDialog";

export type ActiveWalkthrough = { id: string; step: number };
type WalkthroughContextValue = {
  ready: boolean;
  navigationPending: boolean;
  progress: WalkthroughProgress;
  active: ActiveWalkthrough | null;
  notice: UserGuide | null;
  demoMode: boolean;
  storageAvailable: boolean;
  start: (id: string, restart?: boolean) => void;
  startDemo: (id?: string) => void;
  advance: (delta: number) => void;
  finish: () => void;
  skip: (permanent?: boolean) => void;
  dismissNotice: () => void;
  setNeverPrompt: (value: boolean) => void;
  setGuideNeverSuggest: (id: string, value: boolean) => void;
  browse: () => void;
};
const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function useWalkthrough() {
  const context = useContext(WalkthroughContext);
  if (!context) throw new Error("WalkthroughProvider is missing");
  return context;
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { hydrated, demoMode, resetDemoMode } = useJarvisState();
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const navigate = useCallback((href: string) => startNavigation(() => router.push(href)), [router, startNavigation]);
  const pathname = usePathname();
  const key = session?.user?.id ? walkthroughKey(session.user.id, demoMode) : null;
  const [stored, setStored] = useState<{ key: string; progress: WalkthroughProgress } | null>(null);
  const [active, setActive] = useState<ActiveWalkthrough | null>(null);
  const [notice, setNotice] = useState<UserGuide | null>(null);
  const [modal, setModal] = useState<"welcome" | "complete" | null>(null);
  const [finishedGuide, setFinishedGuide] = useState<UserGuide | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const pendingDemoRef = useRef<string | null>(null);
  const memoryProgressRef = useRef(new Map<string, WalkthroughProgress>());
  const promptedRef = useRef(new Set<string>());
  const ready = Boolean(key && stored?.key === key && hydrated && status === "authenticated");
  const progress = stored?.key === key ? stored.progress : freshProgress();

  useEffect(() => {
    if (!key || !hydrated || status !== "authenticated") return;
    let cancelled = false;
    // Wait for the account and workspace selection to commit before hydrating
    // their browser-specific guide progress.
    queueMicrotask(() => {
      if (cancelled) return;
      let loaded = memoryProgressRef.current.get(key) ?? freshProgress();
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) loaded = parseProgress(raw);
      } catch {
        setStorageAvailable(false);
      }
      const demoGuide = demoMode ? pendingDemoRef.current : null;
      pendingDemoRef.current = null;
      if (demoGuide) loaded = recordGuide(freshProgress(true), demoGuide, 0, "in-progress", Date.now());
      // Entering demo mode alone is quiet; Start walkthrough is an explicit action.
      if (demoMode) loaded = { ...loaded, welcomed: true };
      setStored({ key, progress: loaded });
      setNotice(null);
      setActive(demoGuide ? { id: demoGuide, step: 0 } : null);
      const welcome = !demoMode && !loaded.welcomed && !loaded.neverPrompt;
      setModal(welcome ? "welcome" : null);
      if (welcome || demoGuide) promptedRef.current.add(key);
      if (demoGuide) navigate(findGuide(demoGuide)!.steps[0].route);
    });
    return () => { cancelled = true; };
  }, [key, hydrated, status, demoMode, navigate]);

  useEffect(() => {
    if (!stored) return;
    memoryProgressRef.current.set(stored.key, stored.progress);
    if (stored.key !== key) return;
    try {
      window.localStorage.setItem(stored.key, JSON.stringify(stored.progress));
    } catch {
      queueMicrotask(() => setStorageAvailable(false));
    }
  }, [stored, key]);

  const update = useCallback((change: (current: WalkthroughProgress) => WalkthroughProgress) => {
    setStored((current) => current && current.key === key ? { ...current, progress: change(current.progress) } : current);
  }, [key]);

  const start = useCallback((id: string, restart = false) => {
    const guide = findGuide(id);
    if (!ready || !guide) return;
    const step = restart ? 0 : resumeStep(progress, id);
    update((current) => recordGuide(current, id, step, "in-progress", Date.now()));
    setActive({ id, step });
    setNotice(null);
    setModal(null);
    promptedRef.current.add(key!);
    navigate(guide.steps[step].route);
  }, [ready, progress, update, key, navigate]);

  const startDemo = useCallback((id = "essentials") => {
    if (!ready || !findGuide(id)) return;
    if (demoMode) {
      resetDemoMode();
      update(() => recordGuide(freshProgress(true), id, 0, "in-progress", Date.now()));
      setActive({ id, step: 0 });
      setModal(null);
      setNotice(null);
      promptedRef.current.add(key!);
      navigate(findGuide(id)!.steps[0].route);
    } else {
      // A demo tour acknowledges the welcome in the personal workspace too,
      // while keeping all actual guide progress and dismissals separate.
      const acknowledged = { ...progress, welcomed: true, lastPromptAt: Date.now() };
      try {
        window.localStorage.setItem(key!, JSON.stringify(acknowledged));
      } catch {
        setStorageAvailable(false);
      }
      update(() => acknowledged);
      pendingDemoRef.current = id;
      resetDemoMode();
    }
  }, [ready, demoMode, resetDemoMode, update, key, navigate, progress]);

  const skip = useCallback((permanent = false) => {
    const id = active?.id ?? "essentials";
    update((current) => recordGuide(current, id, active?.step ?? resumeStep(current, id), permanent ? "dismissed" : "skipped", Date.now()));
    setActive(null);
    setModal(null);
    setNotice(null);
    if (key) promptedRef.current.add(key);
  }, [active, update, key]);

  const browse = useCallback(() => {
    update((current) => ({ ...current, welcomed: true, lastPromptAt: Date.now() }));
    setActive(null);
    setModal(null);
    setNotice(null);
    if (key) promptedRef.current.add(key);
    navigate("/v2/guide");
  }, [update, key, navigate]);

  function advance(delta: number) {
    if (!active) return;
    const guide = findGuide(active.id)!;
    const next = Math.max(0, Math.min(active.step + delta, guide.steps.length - 1));
    update((current) => recordGuide(current, active.id, next, "in-progress", Date.now()));
    setActive({ ...active, step: next });
    navigate(guide.steps[next].route);
  }

  function finish() {
    if (!active) return;
    update((current) => recordGuide(current, active.id, active.step, "completed", Date.now()));
    setFinishedGuide(findGuide(active.id)!);
    setActive(null);
    setModal("complete");
  }

  function dismissNotice() {
    if (!notice) return;
    update((current) => recordGuide(current, notice.id, resumeStep(current, notice.id), "skipped", Date.now()));
    setNotice(null);
  }

  function setGuideNeverSuggest(id: string, value: boolean) {
    update((current) => {
      const guide = current.guides[id];
      return guide ? { ...current, guides: { ...current.guides, [id]: { ...guide, neverSuggest: value } } } : current;
    });
  }

  function setNeverPrompt(value: boolean) {
    update((current) => ({ ...current, neverPrompt: value, welcomed: true }));
    if (value) setNotice(null);
  }

  useEffect(() => {
    if (!ready || !key || active || modal || notice || promptedRef.current.has(key) || pathname === "/v2/guide") return;
    const essentials = progress.guides.essentials;
    const guide = pathname === "/v2" && essentials && ["in-progress", "skipped"].includes(essentials.status)
      ? findGuide("essentials") : guideForPath(pathname);
    if (!guide || !shouldSuggest(progress, guide.id, Date.now())) return;
    const timer = window.setTimeout(() => {
      if (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).some((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]')) || document.activeElement?.matches("input, textarea, select, [contenteditable=true]")) return;
      promptedRef.current.add(key);
      setNotice(guide);
      update((current) => ({ ...current, lastPromptAt: Date.now() }));
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [ready, key, active, modal, notice, pathname, progress, update]);

  useEffect(() => {
    const replay = () => demoMode ? startDemo() : start("essentials", true);
    window.addEventListener(WALKTHROUGH_REPLAY_EVENT, replay);
    return () => window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, replay);
  }, [demoMode, startDemo, start]);

  return (
    <WalkthroughContext.Provider value={{ ready, navigationPending, progress, active, notice, demoMode, storageAvailable, start, startDemo, advance, finish, skip, dismissNotice, setNeverPrompt, setGuideNeverSuggest, browse }}>
      {children}
      {ready && modal && (
        <WalkthroughDialog
          mode={modal}
          finishedGuide={finishedGuide}
          onClose={() => modal === "welcome" ? skip() : setModal(null)}
        />
      )}
    </WalkthroughContext.Provider>
  );
}
