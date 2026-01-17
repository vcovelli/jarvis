"use client";

import { useMemo, useState } from "react";

import { DayKey, getDayKey, useJarvisState } from "@/lib/jarvisStore";

type WeekSummary = {
  avgSleepHours: number | null;
  avgMood: number | null;
  bestDayLabel: string | null;
  bestMode: string | null;
  lowSleepImpact: string | null;
  topKillers: Array<{ label: string; count: number }>;
  reviewCaptured: number;
  reviewReflections: string[];
  mustWinLocked: number;
  mustWinWon: number;
};

export default function WeeklyReviewPage() {
  const { state, hydrated, saveWeeklyReview } = useJarvisState();
  const weekKey = useMemo(() => getWeekKey(), []);
  const review = state.weeklyReview[weekKey];
  const [stop, setStop] = useState(review?.stop ?? "");
  const [doubleDown, setDoubleDown] = useState(review?.doubleDown ?? "");
  const [experiment, setExperiment] = useState(review?.experiment ?? "");
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);

  const summary = useMemo(() => buildWeekSummary(state), [state]);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading review…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Weekly Systems Review</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Patterns &gt; noise</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Auto-insights from the last 7 days plus a short manual reset.
        </p>
      </header>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileInsightsOpen((current) => !current)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.3em] text-white/80"
          aria-expanded={mobileInsightsOpen}
        >
          {mobileInsightsOpen ? "Hide insights" : "View insights"}
        </button>
      </div>

      <section className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${mobileInsightsOpen ? "lg:grid" : "hidden lg:grid"}`}>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Avg sleep</h2>
          <p className="mt-2 text-3xl font-semibold text-cyan-200">
            {summary.avgSleepHours ? `${summary.avgSleepHours.toFixed(1)}h` : "–"}
          </p>
          <p className="mt-2 text-sm text-zinc-300">Average nightly sleep logged.</p>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Avg mood</h2>
          <p className="mt-2 text-3xl font-semibold text-cyan-200">
            {summary.avgMood ? `${summary.avgMood.toFixed(1)}/10` : "–"}
          </p>
          <p className="mt-2 text-sm text-zinc-300">Rolling mood score.</p>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Best day type</h2>
          <p className="mt-2 text-2xl font-semibold text-white">
            {summary.bestDayLabel ?? "–"}
          </p>
          <p className="mt-2 text-sm text-zinc-300">Most completed priorities.</p>
        </div>
      </section>

      <section className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${mobileInsightsOpen ? "lg:grid" : "hidden lg:grid"}`}>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Operating mode winner</h2>
          <p className="mt-3 text-2xl font-semibold text-white">{summary.bestMode ?? "–"}</p>
          <p className="mt-2 text-sm text-zinc-300">Most common operating mode.</p>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Correlation highlight</h2>
          <p className="mt-3 text-sm text-zinc-200">
            {summary.lowSleepImpact ??
              "Log more days with sleep + todo completion to unlock this insight."}
          </p>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Must Win stats</h2>
          <p className="mt-3 text-2xl font-semibold text-white">
            {summary.mustWinWon}/{summary.mustWinLocked}
          </p>
          <p className="mt-2 text-sm text-zinc-300">Wins vs locked days past week.</p>
        </div>
      </section>

      <section className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-2 ${mobileInsightsOpen ? "lg:grid" : "hidden lg:grid"}`}>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Top productivity killers</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-300">
            {summary.topKillers.length === 0 ? (
              <li>Log reviews and Must Win outcomes to surface the killers.</li>
            ) : (
              summary.topKillers.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4">
                  <span>• {item.label}</span>
                  <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{item.count}×</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Review reflections</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Captured {summary.reviewCaptured}/7 nights this week.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-200">
            {summary.reviewReflections.length === 0 ? (
              <li>End the day with the 30-second review to build insight.</li>
            ) : (
              summary.reviewReflections.map((entry, index) => (
                <li
                  key={`${entry}-${index}`}
                  className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3 text-zinc-200"
                >
                  &quot;{entry}&quot;
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-white">Manual reset</h2>
            <p className="mt-1 text-sm text-zinc-300">
              One stop, one double-down, one experiment.
            </p>
          </div>
          {review && (
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
              Saved
            </span>
          )}
        </div>
        <form
          className="mt-6 grid gap-4 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveWeeklyReview({ weekKey, stop, doubleDown, experiment });
          }}
        >
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              Stop
            </label>
            <textarea
              value={stop}
              onChange={(event) => setStop(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
              placeholder="One thing to stop."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              Double down
            </label>
            <textarea
              value={doubleDown}
              onChange={(event) => setDoubleDown(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
              placeholder="One thing to double down."
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-400">
              Experiment
            </label>
            <textarea
              value={experiment}
              onChange={(event) => setExperiment(event.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
              placeholder="One experiment for next week."
            />
          </div>
          <div className="lg:col-span-3">
            <button
              type="submit"
              className="w-full rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900"
            >
              Save review
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function buildWeekSummary(state: ReturnType<typeof useJarvisState>["state"]): WeekSummary {
  const days = getLastSevenDays();
  const sleepHours: number[] = [];
  const moodScores: number[] = [];
  const completionsByDay: Array<{ label: string; completed: number }> = [];
  const modeCounts = new Map<string, number>();
  const lowSleepDays: number[] = [];
  const lowSleepCompleted: number[] = [];
  const reviewReasons = new Map<string, number>();
  const reviewNotes: string[] = [];
  let reviewCaptured = 0;
  let mustWinLocked = 0;
  let mustWinWon = 0;

  days.forEach((day) => {
    const sleep = (state.sleep[day] ?? []).slice();
    const mood = (state.mood[day] ?? []).slice();
    const todos = state.todos[day] ?? [];
    const mode = state.operatingMode[day]?.mode;
    const review = state.dailyReview[day];
    const mustWin = state.mustWin[day];

    if (sleep.length) {
      const latest = sleep.sort((a, b) => b.ts - a.ts)[0];
      const hours = latest.durationMins / 60;
      sleepHours.push(hours);
      if (hours < 6) {
        lowSleepDays.push(hours);
        lowSleepCompleted.push(todos.filter((todo) => todo.done).length);
      }
    }

    if (mood.length) {
      const latestMood = mood.sort((a, b) => b.ts - a.ts)[0];
      moodScores.push(latestMood.mood);
    }

    completionsByDay.push({
      label: dayKeyToLabel(day),
      completed: todos.filter((todo) => todo.done).length,
    });

    if (mode) {
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
    }

    if (review) {
      reviewCaptured += 1;
      if (review.reason) {
        reviewReasons.set(review.reason, (reviewReasons.get(review.reason) ?? 0) + 1);
      }
      if (review.tomorrow) {
        reviewNotes.push(review.tomorrow);
      }
    }

    if (mustWin) {
      mustWinLocked += 1;
      if (mustWin.done) {
        mustWinWon += 1;
      }
    }
  });

  const bestDay = completionsByDay.sort((a, b) => b.completed - a.completed)[0];
  const bestModeRaw = Array.from(modeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const lowSleepImpact =
    lowSleepDays.length > 0
      ? `On nights under 6h, you completed ${average(lowSleepCompleted).toFixed(1)} tasks on average.`
      : null;

  const topKillers = Array.from(reviewReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({
      label: formatReviewReason(reason),
      count,
    }));
  const reviewReflections = reviewNotes.slice(-3).reverse();

  return {
    avgSleepHours: sleepHours.length ? average(sleepHours) : null,
    avgMood: moodScores.length ? average(moodScores) : null,
    bestDayLabel: bestDay ? bestDay.label : null,
    bestMode: bestModeRaw ? formatModeLabel(bestModeRaw) : null,
    lowSleepImpact,
    topKillers,
    reviewCaptured,
    reviewReflections,
    mustWinLocked,
    mustWinWon,
  };
}

function getLastSevenDays(): DayKey[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - index);
    return getDayKey(date);
  }).reverse();
}

function getWeekKey(date = new Date()): string {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return getDayKey(start);
}

function dayKeyToLabel(dayKey: DayKey): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatModeLabel(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatReviewReason(value: string): string {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
