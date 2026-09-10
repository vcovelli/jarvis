"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useJarvisState } from "@/lib/jarvisStore";
import { findGuide, type UserGuide } from "@/lib/userGuides";
import { freshProgress, parseProgress, recordGuide, resumeStep, shouldWelcome, walkthroughKey, type WalkthroughProgress } from "@/lib/walkthroughProgress";
import { WalkthroughDialog } from "./WalkthroughDialog";

export type ActiveWalkthrough = { id: string; step: number };
type WalkthroughContextValue = {
  ready: boolean;
  navigationPending: boolean;
  progress: WalkthroughProgress;
  active: ActiveWalkthrough | null;
  demoMode: boolean;
  storageAvailable: boolean;
  start: (id: string, restart?: boolean) => void;
  startDemo: (id?: string) => void;
  advance: (delta: number) => void;
  finish: () => void;
  skip: () => void;
  browse: () => void;
};
const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);
export const useOptionalWalkthrough = () => useContext(WalkthroughContext);

export function useWalkthrough() {
  const context = useOptionalWalkthrough();
  if (!context) throw new Error("WalkthroughProvider is missing");
  return context;
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const { hydrated, demoMode, resetDemoMode } = useJarvisState();
  const router = useRouter();
  const [navigationPending, startNavigation] = useTransition();
  const navigate = useCallback((href: string) => startNavigation(() => router.push(href)), [router]);
  const key = session?.user?.id ? walkthroughKey(session.user.id, demoMode) : null;
  const [stored, setStored] = useState<{ key: string; progress: WalkthroughProgress } | null>(null);
  const [active, setActive] = useState<ActiveWalkthrough | null>(null);
  const [modal, setModal] = useState<"welcome" | "complete" | null>(null);
  const [finishedGuide, setFinishedGuide] = useState<UserGuide | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const pendingDemoRef = useRef<string | null>(null);
  const memoryProgressRef = useRef(new Map<string, WalkthroughProgress>());
  const ready = Boolean(key && stored?.key === key && hydrated && status === "authenticated");
  const progress = stored?.key === key ? stored.progress : freshProgress();

  // Write before routing so reloading immediately after Next cannot revive a tip.
  const commit = useCallback((storageKey: string, next: WalkthroughProgress) => {
    memoryProgressRef.current.set(storageKey, next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
    setStored({ key: storageKey, progress: next });
  }, []);

  useEffect(() => {
    if (!key || !hydrated || status !== "authenticated") return;
    let cancelled = false;
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
      const welcome = shouldWelcome(loaded, demoMode);
      if (demoGuide) loaded = recordGuide(freshProgress(true), demoGuide, 0, "in-progress", Date.now());
      // Even reloading the welcome is quiet. The user guide always offers replay.
      commit(key, { ...loaded, welcomed: true });
      setActive(demoGuide ? { id: demoGuide, step: 0 } : null);
      setModal(welcome ? "welcome" : null);
      if (demoGuide) navigate(findGuide(demoGuide)!.steps[0].route);
    });
    return () => { cancelled = true; };
  }, [key, hydrated, status, demoMode, navigate, commit]);

  useEffect(() => {
    function syncProgress(event: StorageEvent) {
      if (!key || event.key !== key || !event.newValue) return;
      const next = parseProgress(event.newValue);
      memoryProgressRef.current.set(key, next);
      setStored({ key, progress: next });
      setActive(null);
      setModal(null);
    }
    window.addEventListener("storage", syncProgress);
    return () => window.removeEventListener("storage", syncProgress);
  }, [key]);

  function update(change: (current: WalkthroughProgress) => WalkthroughProgress) {
    if (ready && key) commit(key, change(memoryProgressRef.current.get(key) ?? progress));
  }

  function start(id: string, restart = false) {
    const guide = findGuide(id);
    if (!ready || !guide) return;
    const step = restart ? 0 : resumeStep(progress, id);
    update((current) => recordGuide(current, id, step, "in-progress", Date.now()));
    setActive({ id, step });
    setModal(null);
    navigate(guide.steps[step].route);
  }

  function startDemo(id = "essentials") {
    const guide = findGuide(id);
    if (!ready || !guide) return;
    if (demoMode) {
      resetDemoMode();
      update(() => recordGuide(freshProgress(true), id, 0, "in-progress", Date.now()));
      setActive({ id, step: 0 });
      setModal(null);
      navigate(guide.steps[0].route);
    } else {
      update((current) => ({ ...current, welcomed: true }));
      pendingDemoRef.current = id;
      resetDemoMode();
    }
  }

  function skip() {
    const id = active?.id ?? "essentials";
    update((current) => recordGuide(current, id, active?.step ?? resumeStep(current, id), "skipped", Date.now()));
    setActive(null);
    setModal(null);
  }

  function browse() {
    update((current) => ({ ...current, welcomed: true }));
    setActive(null);
    setModal(null);
    navigate("/v2/guide");
  }

  function advance(delta: number) {
    if (!active || navigationPending) return;
    const guide = findGuide(active.id)!;
    const next = Math.max(0, Math.min(active.step + delta, guide.steps.length - 1));
    update((current) => recordGuide(current, active.id, next, "in-progress", Date.now()));
    setActive({ ...active, step: next });
    navigate(guide.steps[next].route);
  }

  function finish() {
    if (!active || navigationPending) return;
    update((current) => recordGuide(current, active.id, active.step, "completed", Date.now()));
    setFinishedGuide(findGuide(active.id)!);
    setActive(null);
    setModal("complete");
  }

  return (
    <WalkthroughContext.Provider value={{ ready, navigationPending, progress, active: ready ? active : null, demoMode, storageAvailable, start, startDemo, advance, finish, skip, browse }}>
      {children}
      {ready && modal && <WalkthroughDialog mode={modal} finishedGuide={finishedGuide} onClose={() => modal === "welcome" ? skip() : setModal(null)} />}
    </WalkthroughContext.Provider>
  );
}
