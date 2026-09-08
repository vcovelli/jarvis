"use client";

import { useMemo } from "react";
import { useWalkthrough } from "@/components/onboarding/WalkthroughProvider";

import { useJarvisState } from "@/lib/jarvisStore";

type DemoStat = {
  label: string;
  value: string;
  detail: string;
};

export default function SettingsPage() {
  const { startDemo, browse } = useWalkthrough();
  const { state, hydrated, syncStatus, demoMode, enableDemoMode, disableDemoMode, resetDemoMode } = useJarvisState();
  const stats = useMemo<DemoStat[]>(() => {
    const todoCount = Object.values(state.todos).reduce((total, todos) => total + todos.length, 0);
    const doneCount = Object.values(state.todos).reduce(
      (total, todos) => total + todos.filter((todo) => todo.done).length,
      0,
    );
    const journalCount = Object.values(state.journal).reduce((total, entries) => total + entries.length, 0);
    const sleepCount = Object.values(state.sleep).reduce((total, entries) => total + entries.length, 0);
    const reviewCount = Object.keys(state.dailyReview).length + Object.keys(state.weeklyReview).length;
    const projectCount = state.objectives.reduce((total, objective) => total + objective.projects.length, 0);

    return [
      { label: "Tasks", value: String(todoCount), detail: `${doneCount} complete` },
      { label: "Journal", value: String(journalCount), detail: "Recent notes" },
      { label: "Sleep", value: String(sleepCount), detail: "Tracked nights" },
      { label: "Habits", value: String(state.habits.length), detail: "Active routines" },
      { label: "Objectives", value: String(state.objectives.length), detail: `${projectCount} projects` },
      { label: "Reviews", value: String(reviewCount), detail: "Daily and weekly" },
    ];
  }, [state]);


  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <section className="glass-panel mobile-card-padding mobile-compact-header overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.42em] text-cyan-200/80">Settings</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Platform controls</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
              Switch Jarvis into a privacy-safe showcase workspace before sharing your screen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={demoMode ? "Demo mode" : "Real data"} tone={demoMode ? "warn" : "good"} />
            <StatusPill label={syncStatus.remote === "idle" ? "Local" : syncStatus.remote} tone="neutral" />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,0.55fr)]">
        <div className="glass-panel mobile-card-padding rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] uppercase tracking-[0.32em] text-zinc-500">Privacy mode</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Show dummy data</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Demo mode swaps the app to a generated workspace for dashboards, todos, habits, reviews, homelab, and finance.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[240px]">
              <button
                type="button"
                data-guide="demo-controls"
                onClick={demoMode ? disableDemoMode : enableDemoMode}
                disabled={!hydrated}
                className="rounded-full bg-cyan-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {demoMode ? "Return to real data" : "Show dummy data"}
              </button>
              <button
                type="button"
                onClick={() => startDemo()}
                disabled={!hydrated}
                className="rounded-full border border-emerald-300/35 bg-emerald-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100 transition hover:border-emerald-200/70 hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start demo walkthrough
              </button>
              <button
                type="button"
                onClick={browse}
                data-guide="guide-controls"
                disabled={!hydrated}
                className="theme-button-secondary rounded-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] disabled:cursor-not-allowed disabled:opacity-50"
              >
                User guide & saved progress
              </button>
              {demoMode ? (
                <button
                  type="button"
                  onClick={resetDemoMode}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold uppercase tracking-[0.24em] text-zinc-200 transition hover:border-white/30 hover:text-white"
                >
                  Reset dummy data
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Guardrail label="No overwrite" detail="Your saved state stays in its own local and remote storage path." />
            <Guardrail label="No Plaid leak" detail="Finance uses generated balances and events while demo mode is active." />
            <Guardrail label="Fast exit" detail="Return to real data restores your normal Jarvis workspace instantly." />
          </div>
        </div>

        <aside className="glass-panel mobile-card-padding rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.32em] text-zinc-500">Current view</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{demoMode ? "Showcase workspace" : "Personal workspace"}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {demoMode
              ? "You are looking at generated data. Edits made during the demo stay out of your saved personal state."
              : "Enable demo mode before sharing your screen to hide personal records across the app."}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white tabular-nums">{stat.value}</p>
                <p className="mt-1 text-xs text-zinc-400">{stat.detail}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function Guardrail({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{detail}</p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  const classes =
    tone === "good"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-white/5 text-white/70";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.23em] ${classes}`}>
      {label}
    </span>
  );
}
