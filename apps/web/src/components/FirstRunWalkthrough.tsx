"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useJarvisState } from "@/lib/jarvisStore";

export const WALKTHROUGH_KEY = "jarvis-first-run-walkthrough-complete-v1";
export const WALKTHROUGH_REPLAY_EVENT = "jarvis-first-run-walkthrough-replay";

type WalkthroughStep = {
  kicker: string;
  title: string;
  body: string;
  outcome: string;
  href: string;
  cta: string;
  checkpoints: string[];
};

const steps: WalkthroughStep[] = [
  {
    kicker: "Mobile remote",
    title: "Start with the fastest jump, not the dashboard.",
    body: "The mobile home screen is the remote. It points to the single page that matches what the user is trying to do right now.",
    outcome: "Use it to log, capture, review, or open the assistant in one tap.",
    href: "/v2",
    cta: "Open remote",
    checkpoints: ["Mood", "Must Win", "Mind Sweep"],
  },
  {
    kicker: "Loose work",
    title: "Capture scattered tasks before forcing a time block.",
    body: "Mind Sweep is the soft backlog lane for ideas, reminders, and tasks that need to linger until they are ready for the calendar.",
    outcome: "Promote the right items into scheduled blocks only when they earn a slot.",
    href: "/v2/daily?mode=backlog",
    cta: "Open mind sweep",
    checkpoints: ["Capture", "Promote", "Schedule"],
  },
  {
    kicker: "Showcase",
    title: "Demo mode turns the app into a pitch-ready workspace.",
    body: "Use generated data before sharing the screen. The walkthrough can be replayed from Settings when you want to present the flow again.",
    outcome: "Show the full system without exposing personal records.",
    href: "/v2/settings",
    cta: "Open settings",
    checkpoints: ["Demo data", "Themes", "Replay"],
  },
];

export function FirstRunWalkthrough() {
  const { demoMode, enableDemoMode } = useJarvisState();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const progressLabel = useMemo(() => String(stepIndex + 1) + " / " + steps.length, [stepIndex]);

  const complete = useCallback(() => {
    try {
      window.localStorage.setItem(WALKTHROUGH_KEY, "true");
    } catch {
      // The walkthrough should still close when browser storage is unavailable.
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    try {
      const complete = window.localStorage.getItem(WALKTHROUGH_KEY) === "true";
      setOpen(!complete);
    } catch {
      setOpen(true);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    function replayWalkthrough() {
      setStepIndex(0);
      setOpen(true);
      setReady(true);
    }

    window.addEventListener(WALKTHROUGH_REPLAY_EVENT, replayWalkthrough);
    return () => window.removeEventListener(WALKTHROUGH_REPLAY_EVENT, replayWalkthrough);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("scroll-locked");
    return () => document.body.classList.remove("scroll-locked");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") complete();
      if (event.key === "ArrowRight") setStepIndex((current) => Math.min(current + 1, steps.length - 1));
      if (event.key === "ArrowLeft") setStepIndex((current) => Math.max(current - 1, 0));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, complete]);

  function startDemoMode() {
    enableDemoMode();
  }

  if (!ready || !open || !step) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 px-3 py-4 backdrop-blur-md sm:items-center sm:px-6" data-no-pull-refresh="true">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="walkthrough-title"
        className="theme-modal w-full max-w-lg rounded-[28px] p-5 shadow-[0_28px_100px_rgba(0,0,0,0.55)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="theme-kicker text-[10px] uppercase tracking-[0.34em]">{step.kicker}</p>
            <h2 id="walkthrough-title" className="theme-text mt-2 text-2xl font-semibold leading-tight">
              {step.title}
            </h2>
          </div>
          <span className="theme-pill shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em]">
            {progressLabel}
          </span>
        </div>

        <p className="theme-muted mt-4 text-sm leading-6">{step.body}</p>
        <div className="theme-card mt-5 rounded-2xl p-4">
          <p className="theme-kicker text-[10px] uppercase tracking-[0.3em]">Expected result</p>
          <p className="theme-text mt-2 text-sm font-medium leading-6">{step.outcome}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {step.checkpoints.map((checkpoint) => (
              <span key={checkpoint} className="theme-chip rounded-xl px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em]">
                {checkpoint}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {steps.map((item, index) => (
            <button
              key={item.kicker}
              type="button"
              onClick={() => setStepIndex(index)}
              className={"h-2 rounded-full transition " + (index <= stepIndex ? "theme-button-primary" : "theme-card")}
              aria-label={"Go to " + item.kicker}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
              disabled={stepIndex === 0}
              className="theme-button-secondary rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (stepIndex === steps.length - 1) {
                  complete();
                  return;
                }
                setStepIndex((current) => current + 1);
              }}
              className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {stepIndex === steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={startDemoMode}
              disabled={demoMode}
              className="theme-button-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-default disabled:opacity-70"
            >
              {demoMode ? "Demo mode on" : "Start demo mode"}
            </button>
            <Link href={step.href} onClick={complete} className="theme-button-secondary rounded-xl px-4 py-2 text-center text-sm font-semibold">
              {step.cta}
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={complete}
          className="theme-button-secondary mt-4 min-h-10 w-full rounded-xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] transition hover:opacity-80 sm:w-auto"
        >
          Skip walkthrough
        </button>
      </section>
    </div>
  );
}
