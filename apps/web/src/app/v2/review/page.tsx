"use client";

import { useMemo, useState } from "react";

import { DayKey, getDayKey, useJarvisState } from "@/lib/jarvisStore";

type WeekDayInsight = {
  day: DayKey;
  label: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  recovery: number | null;
  mood: number | null;
  todosDone: number;
  todosTotal: number;
  mustWinDone: boolean | null;
};

type CorrelationInsight = {
  label: string;
  r: number | null;
  sampleCount: number;
  descriptor: string;
};

type TagInsight = {
  label: string;
  avgMood: number;
  count: number;
};

type WeekSummary = {
  days: WeekDayInsight[];
  avgSleepHours: number | null;
  avgSleepQuality: number | null;
  avgRecovery: number | null;
  avgMood: number | null;
  completionRate: number | null;
  sleepConsistency: number | null;
  sleepDebt: number | null;
  recoveryTrend: number | null;
  moodVariability: number | null;
  bestDayLabel: string | null;
  worstDayLabel: string | null;
  bestMode: string | null;
  lowSleepImpact: string | null;
  correlations: CorrelationInsight[];
  tagHighs: TagInsight[];
  tagLows: TagInsight[];
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
  const weekLabel = useMemo(() => formatWeekLabel(weekKey), [weekKey]);
  const dayLabels = summary.days.map((day) => day.label);
  const completionRates = summary.days.map((day) =>
    day.todosTotal ? day.todosDone / day.todosTotal : null,
  );
  const insightHighlights = useMemo(() => buildInsightHighlights(summary), [summary]);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading review…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Weekly Systems Review</p>
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

      <div className={`space-y-6 ${mobileInsightsOpen ? "" : "hidden lg:block"}`}>
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <InsightCard
            title="Avg sleep"
            value={summary.avgSleepHours ? `${summary.avgSleepHours.toFixed(1)}h` : "–"}
            subtitle="Average nightly sleep logged."
            accent="text-cyan-200"
          />
          <InsightCard
            title="Avg mood"
            value={summary.avgMood ? `${summary.avgMood.toFixed(1)}/10` : "–"}
            subtitle="Rolling mood score."
            accent="text-emerald-200"
          />
          <InsightCard
            title="Completion rate"
            value={summary.completionRate !== null ? `${Math.round(summary.completionRate * 100)}%` : "–"}
            subtitle="Todos finished this week."
            accent="text-amber-200"
          />
          <InsightCard
            title="Must Win"
            value={`${summary.mustWinWon}/${summary.mustWinLocked}`}
            subtitle="Wins vs locked days."
            accent="text-white"
          />
          <InsightCard
            title="Sleep debt"
            value={summary.sleepDebt !== null ? `${summary.sleepDebt.toFixed(1)}h` : "–"}
            subtitle="Total under 7.5h target."
            accent="text-cyan-200"
          />
          <InsightCard
            title="Recovery trend"
            value={
              summary.recoveryTrend !== null
                ? `${summary.recoveryTrend >= 0 ? "+" : ""}${summary.recoveryTrend.toFixed(1)}`
                : "–"
            }
            subtitle="7-day recovery slope."
            accent="text-emerald-200"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-white">Weekly trends</h2>
                <p className="text-sm text-zinc-300">Normalized trend lines for the last 7 days.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
                {weekLabel}
              </span>
            </div>
            <div className="mt-6">
              <TrendChart
                labels={dayLabels}
                series={[
                  { label: "Sleep", values: summary.days.map((day) => day.sleepHours), color: "#67e8f9" },
                  { label: "Mood", values: summary.days.map((day) => day.mood), color: "#a7f3d0" },
                  { label: "Completion", values: completionRates, color: "#fcd34d" },
                ]}
              />
            </div>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-white">Task completion</h2>
                <p className="text-sm text-zinc-300">Daily todo completion rate.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">Last 7 days</span>
            </div>
            <div className="mt-6">
              <BarChart labels={dayLabels} values={completionRates} />
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs uppercase tracking-[0.3em] text-zinc-400">
                <div>
                  <p className="text-[11px] text-zinc-500">Best day</p>
                  <p className="text-sm text-white">{summary.bestDayLabel ?? "–"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500">Worst day</p>
                  <p className="text-sm text-white">{summary.worstDayLabel ?? "–"}</p>
                </div>
                <div>
                  <p className="text-[11px] text-zinc-500">Operating mode</p>
                  <p className="text-sm text-white">{summary.bestMode ?? "–"}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-white">Correlations</h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-200">
              {summary.correlations.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.3em] text-zinc-400">{item.label}</span>
                    <span className="text-xs text-white/70">
                      {item.r === null ? "–" : item.r.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-200">
                    {item.r === null ? "Not enough data points yet." : item.descriptor}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-white">Mood tag impact</h2>
            <p className="mt-1 text-sm text-zinc-300">Average mood score when a tag appears.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Lift</p>
                <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                  {summary.tagHighs.length === 0 ? (
                    <li className="text-zinc-400">Log mood tags to build this list.</li>
                  ) : (
                    summary.tagHighs.map((tag) => (
                      <li key={`high-${tag.label}`} className="flex items-center justify-between gap-3">
                        <span>{tag.label}</span>
                        <span className="text-xs text-emerald-200">
                          {tag.avgMood.toFixed(1)} ({tag.count}×)
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-rose-200">Drag</p>
                <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                  {summary.tagLows.length === 0 ? (
                    <li className="text-zinc-400">Log mood tags to build this list.</li>
                  ) : (
                    summary.tagLows.map((tag) => (
                      <li key={`low-${tag.label}`} className="flex items-center justify-between gap-3">
                        <span>{tag.label}</span>
                        <span className="text-xs text-rose-200">
                          {tag.avgMood.toFixed(1)} ({tag.count}×)
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
            <h2 className="text-lg font-medium text-white">Insight highlights</h2>
            <ul className="mt-4 space-y-3 text-sm text-zinc-200">
              {insightHighlights.length === 0 ? (
                <li>Log a few more days to unlock the strongest insights.</li>
              ) : (
                insightHighlights.map((highlight, index) => (
                  <li
                    key={`${highlight}-${index}`}
                    className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3"
                  >
                    {highlight}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
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
            <div className="mt-6 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Sleep consistency</p>
                <p className="mt-2 text-lg text-white">
                  {summary.sleepConsistency === null ? "–" : `${summary.sleepConsistency.toFixed(1)}h`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Mood variability</p>
                <p className="mt-2 text-lg text-white">
                  {summary.moodVariability === null ? "–" : summary.moodVariability.toFixed(1)}
                </p>
              </div>
            </div>
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
            <p className="mt-6 text-sm text-zinc-300">
              {summary.lowSleepImpact ??
                "Log more days with sleep + todo completion to unlock this comparison."}
            </p>
          </div>
        </section>
      </div>

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

function InsightCard({
  title,
  value,
  subtitle,
  accent = "text-white",
}: {
  title: string;
  value: string;
  subtitle: string;
  accent?: string;
}) {
  return (
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      <p className={`mt-2 text-3xl font-semibold ${accent}`}>{value}</p>
      <p className="mt-2 text-sm text-zinc-300">{subtitle}</p>
    </div>
  );
}

function TrendChart({
  labels,
  series,
}: {
  labels: string[];
  series: Array<{ label: string; values: Array<number | null>; color: string }>;
}) {
  const width = 320;
  const height = 150;
  const padding = 16;
  const normalizedSeries = series.map((item) => ({
    ...item,
    values: normalizeSeriesValues(item.values),
  }));
  const min = 0;
  const range = 1;
  const xStep = labels.length > 1 ? (width - padding * 2) / (labels.length - 1) : 0;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <rect x="0" y="0" width={width} height={height} rx="18" fill="rgba(0,0,0,0.25)" />
        {[0, 0.5, 1].map((tick) => {
          const y = padding + (height - padding * 2) * tick;
          return (
            <line
              key={`grid-${tick}`}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          );
        })}
        {normalizedSeries.map((item) => {
          const path = buildLinePath(item.values, min, range, width, height, padding, xStep);
          return (
            <path
              key={item.label}
              d={path}
              stroke={item.color}
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.3em] text-zinc-400">
        {series.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-[11px] uppercase tracking-[0.3em] text-zinc-500">
        {labels.map((label) => (
          <span key={`trend-label-${label}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ labels, values }: { labels: string[]; values: Array<number | null> }) {
  const width = 320;
  const height = 140;
  const padding = 18;
  const barWidth = labels.length ? (width - padding * 2) / labels.length : 0;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
        <rect x="0" y="0" width={width} height={height} rx="18" fill="rgba(0,0,0,0.25)" />
        {values.map((value, index) => {
          const heightValue = value === null ? 0 : value;
          const barHeight = heightValue * (height - padding * 2);
          const x = padding + index * barWidth + barWidth * 0.2;
          const y = height - padding - barHeight;
          return (
            <rect
              key={`bar-${labels[index]}`}
              x={x}
              y={y}
              width={barWidth * 0.6}
              height={Math.max(4, barHeight)}
              rx="8"
              fill={value === null ? "rgba(255,255,255,0.12)" : "url(#barGradient)"}
            />
          );
        })}
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>
      <div className="mt-3 flex justify-between text-[11px] uppercase tracking-[0.3em] text-zinc-500">
        {labels.map((label) => (
          <span key={`bar-label-${label}`}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function buildInsightHighlights(summary: WeekSummary): string[] {
  const highlights: string[] = [];
  if (summary.avgSleepHours !== null && summary.avgMood !== null) {
    highlights.push(
      `Average sleep was ${summary.avgSleepHours.toFixed(1)}h with mood at ${summary.avgMood.toFixed(1)}/10.`,
    );
  }
  if (summary.avgSleepQuality !== null || summary.avgRecovery !== null) {
    const quality = summary.avgSleepQuality !== null ? `quality ${summary.avgSleepQuality.toFixed(1)}/5` : null;
    const recovery = summary.avgRecovery !== null ? `recovery ${summary.avgRecovery.toFixed(1)}/5` : null;
    highlights.push(`Sleep signals: ${[quality, recovery].filter(Boolean).join(" • ")}.`);
  }
  if (summary.lowSleepImpact) {
    highlights.push(summary.lowSleepImpact);
  }
  const strongest = summary.correlations.find((item) => item.r !== null && Math.abs(item.r) >= 0.4);
  if (strongest && strongest.r !== null) {
    highlights.push(`${strongest.label}: ${formatCorrelationDescriptor(strongest.r, strongest.sampleCount)}.`);
  }
  if (summary.tagHighs[0]) {
    highlights.push(
      `Top lift tag: ${summary.tagHighs[0].label} (${summary.tagHighs[0].avgMood.toFixed(1)} mood).`,
    );
  }
  if (summary.bestDayLabel) {
    highlights.push(`Best completion day: ${summary.bestDayLabel}.`);
  }
  return highlights.slice(0, 4);
}

function buildWeekSummary(state: ReturnType<typeof useJarvisState>["state"]): WeekSummary {
  const days = getLastSevenDays();
  const dayInsights: WeekDayInsight[] = [];
  const sleepHours: number[] = [];
  const sleepQualities: number[] = [];
  const recoveries: number[] = [];
  const moodScores: number[] = [];
  const completionRates: number[] = [];
  const modeCounts = new Map<string, number>();
  const lowSleepDays: number[] = [];
  const lowSleepCompleted: number[] = [];
  const highSleepDays: number[] = [];
  const highSleepCompleted: number[] = [];
  const reviewReasons = new Map<string, number>();
  const reviewNotes: string[] = [];
  const tagTotals = new Map<string, { total: number; count: number }>();
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
    const todosDone = todos.filter((todo) => todo.done).length;

    const sleepEntry = sleep.length ? sleep.sort((a, b) => b.ts - a.ts)[0] : null;
    const sleepValue = sleepEntry ? sleepEntry.durationMins / 60 : null;
    const sleepQuality = sleepEntry?.quality ?? null;
    const recovery = sleepEntry?.recoveryScore ?? null;
    if (sleepValue !== null) {
      sleepHours.push(sleepValue);
      if (sleepQuality !== null) sleepQualities.push(sleepQuality);
      if (recovery !== null) recoveries.push(recovery);
      if (sleepValue < 6) {
        lowSleepDays.push(sleepValue);
        lowSleepCompleted.push(todosDone);
      }
      if (sleepValue >= 7.5) {
        highSleepDays.push(sleepValue);
        highSleepCompleted.push(todosDone);
      }
    }

    const moodEntry = mood.length ? mood.sort((a, b) => b.ts - a.ts)[0] : null;
    const moodValue = moodEntry?.mood ?? null;
    if (moodValue !== null) {
      moodScores.push(moodValue);
    }
    mood.forEach((log) => {
      log.tags.forEach((tag) => {
        const key = tag.toLowerCase();
        const entry = tagTotals.get(key) ?? { total: 0, count: 0 };
        entry.total += log.mood;
        entry.count += 1;
        tagTotals.set(key, entry);
      });
    });

    if (todos.length > 0) {
      completionRates.push(todosDone / todos.length);
    }

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

    dayInsights.push({
      day,
      label: dayKeyToLabel(day),
      sleepHours: sleepValue,
      sleepQuality,
      recovery,
      mood: moodValue,
      todosDone,
      todosTotal: todos.length,
      mustWinDone: mustWin ? mustWin.done : null,
    });
  });

  const completionByDay = dayInsights
    .map((day) => ({
      label: day.label,
      rate: day.todosTotal ? day.todosDone / day.todosTotal : null,
    }))
    .filter((day) => day.rate !== null) as Array<{ label: string; rate: number }>;
  const bestDay = completionByDay.reduce(
    (best, day) => (best && best.rate >= day.rate ? best : day),
    null as { label: string; rate: number } | null,
  );
  const worstDay = completionByDay.reduce(
    (worst, day) => (worst && worst.rate <= day.rate ? worst : day),
    null as { label: string; rate: number } | null,
  );
  const bestModeRaw = Array.from(modeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const lowSleepImpact =
    lowSleepDays.length > 0 && highSleepDays.length > 0
      ? `Under 6h sleep you finished ${average(lowSleepCompleted).toFixed(1)} tasks vs ${average(highSleepCompleted).toFixed(1)} tasks on 7.5h+ nights.`
      : null;

  const topKillers = Array.from(reviewReasons.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => ({
      label: formatReviewReason(reason),
      count,
    }));
  const reviewReflections = reviewNotes.slice(-3).reverse();
  const tagInsights = Array.from(tagTotals.entries())
    .map(([label, stats]) => ({
      label: formatTagLabel(label),
      avgMood: stats.total / stats.count,
      count: stats.count,
    }))
    .sort((a, b) => b.avgMood - a.avgMood);

  const tagHighs = tagInsights.slice(0, 3);
  const tagLows = tagInsights
    .slice(-3)
    .reverse()
    .filter((tag) => !tagHighs.some((high) => high.label === tag.label));
  const sleepValues = dayInsights.map((day) => day.sleepHours);
  const moodValues = dayInsights.map((day) => day.mood);
  const recoveryValues = dayInsights.map((day) => day.recovery);
  const completionValues = dayInsights.map((day) =>
    day.todosTotal ? day.todosDone / day.todosTotal : null,
  );
  const correlations = [
    buildCorrelationInsight("Sleep vs mood", sleepValues, moodValues),
    buildCorrelationInsight("Sleep vs completion", sleepValues, completionValues),
    buildCorrelationInsight("Mood vs completion", moodValues, completionValues),
    buildCorrelationInsight("Recovery vs mood", recoveryValues, moodValues),
  ];

  return {
    days: dayInsights,
    avgSleepHours: sleepHours.length ? average(sleepHours) : null,
    avgSleepQuality: sleepQualities.length ? average(sleepQualities) : null,
    avgRecovery: recoveries.length ? average(recoveries) : null,
    avgMood: moodScores.length ? average(moodScores) : null,
    completionRate: completionRates.length ? average(completionRates) : null,
    sleepConsistency: sleepHours.length > 1 ? standardDeviation(sleepHours) : null,
    sleepDebt: sleepHours.length >= 3 ? calculateSleepDebt(sleepHours) : null,
    recoveryTrend: recoveries.length >= 4 ? computeTrendDelta(recoveries) : null,
    moodVariability: moodScores.length > 1 ? standardDeviation(moodScores) : null,
    bestDayLabel: bestDay ? bestDay.label : null,
    worstDayLabel: worstDay ? worstDay.label : null,
    bestMode: bestModeRaw ? formatModeLabel(bestModeRaw) : null,
    lowSleepImpact,
    correlations,
    tagHighs,
    tagLows,
    topKillers,
    reviewCaptured,
    reviewReflections,
    mustWinLocked,
    mustWinWon,
  };
}

function buildCorrelationInsight(
  label: string,
  valuesA: Array<number | null>,
  valuesB: Array<number | null>,
): CorrelationInsight {
  const paired: Array<[number, number]> = [];
  valuesA.forEach((value, index) => {
    const other = valuesB[index];
    if (value === null || other === null) return;
    paired.push([value, other]);
  });
  if (paired.length < 3) {
    return { label, r: null, sampleCount: paired.length, descriptor: "Not enough data points yet." };
  }
  const [listA, listB] = paired.reduce(
    (acc, [a, b]) => {
      acc[0].push(a);
      acc[1].push(b);
      return acc;
    },
    [[], []] as [number[], number[]],
  );
  const r = pearsonCorrelation(listA, listB);
  return {
    label,
    r,
    sampleCount: paired.length,
    descriptor: formatCorrelationDescriptor(r, paired.length),
  };
}

function pearsonCorrelation(valuesA: number[], valuesB: number[]): number {
  const meanA = average(valuesA);
  const meanB = average(valuesB);
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  valuesA.forEach((value, index) => {
    const deltaA = value - meanA;
    const deltaB = valuesB[index] - meanB;
    numerator += deltaA * deltaB;
    sumA += deltaA ** 2;
    sumB += deltaB ** 2;
  });
  const denominator = Math.sqrt(sumA * sumB) || 1;
  return numerator / denominator;
}

function formatCorrelationDescriptor(value: number, samples: number): string {
  const strength = Math.abs(value);
  const direction = value > 0 ? "positive" : value < 0 ? "negative" : "flat";
  const label =
    strength >= 0.6 ? "strong" : strength >= 0.35 ? "moderate" : strength >= 0.2 ? "light" : "weak";
  return `${label} ${direction} relationship across ${samples} data points`;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function calculateSleepDebt(values: number[], targetHours = 7.5): number {
  const net = values.reduce((sum, value) => sum + (targetHours - value), 0);
  return Math.max(0, net);
}

function computeTrendDelta(values: number[], windowSize = 3): number | null {
  if (values.length < 4) return null;
  const size = Math.min(windowSize, Math.floor(values.length / 2));
  if (size === 0) return null;
  const start = average(values.slice(0, size));
  const end = average(values.slice(values.length - size));
  return end - start;
}

function normalizeSeriesValues(values: Array<number | null>): Array<number | null> {
  const filtered = values.filter((value) => value !== null) as number[];
  if (filtered.length === 0) return values;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const range = max - min || 1;
  return values.map((value) => (value === null ? null : (value - min) / range));
}

function buildLinePath(
  values: Array<number | null>,
  min: number,
  range: number,
  width: number,
  height: number,
  padding: number,
  xStep: number,
): string {
  let path = "";
  let started = false;
  values.forEach((value, index) => {
    if (value === null) {
      started = false;
      return;
    }
    const x = padding + index * xStep;
    const y = height - padding - ((value - min) / range) * (height - padding * 2);
    if (!started) {
      path += `M ${x} ${y}`;
      started = true;
    } else {
      path += ` L ${x} ${y}`;
    }
  });
  return path;
}

function formatWeekLabel(weekKey: string): string {
  const [year, month, day] = weekKey.split("-").map(Number);
  const start = new Date(year, (month ?? 1) - 1, day ?? 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel}–${endLabel}`;
}

function formatTagLabel(value: string): string {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
