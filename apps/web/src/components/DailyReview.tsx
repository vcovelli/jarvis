"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useJarvisState, getDayKey, dayKeyToDate, type DailyReviewReason, type DayKey } from "@/lib/jarvisStore";
import { buildDailySummary, shiftDay, type DailyInsight } from "@/lib/dailySummary";
import { useToast } from "@/components/Toast";

const reasons: Array<{ id: DailyReviewReason; label: string }> = [
  { id: "overplanned", label: "Too much planned" },
  { id: "low-energy", label: "Low energy" },
  { id: "distraction", label: "Distractions" },
  { id: "external-interruption", label: "Unexpected interruptions" },
];
type Draft = { expected: boolean | null; reason: DailyReviewReason | ""; tomorrow: string };
const control = "theme-button-secondary min-h-11 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40";

export function DailyReview({ compact = false }: { compact?: boolean }) {
  const { state, hydrated, logDailyReview, syncStatus } = useJarvisState();
  const { showToast } = useToast();
  const today = getDayKey();
  const [day, setDay] = useState<DayKey>(today);
  const [expanded, setExpanded] = useState(!compact);
  const [drafts, setDrafts] = useState<Record<DayKey, Draft>>({});
  const entry = state.dailyReview[day];
  const draft = drafts[day] ?? { expected: entry?.expected ?? null, reason: entry?.reason ?? "", tomorrow: entry?.tomorrow ?? "" };
  const summary = useMemo(() => buildDailySummary(state, day, today), [state, day, today]);
  const label = day === today ? "Today" : day === shiftDay(today, -1) ? "Yesterday" : dayKeyToDate(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const update = (values: Partial<Draft>) => setDrafts((current) => ({ ...current, [day]: { ...draft, ...values } }));

  function save(event: FormEvent) {
    event.preventDefault();
    if (!hydrated || draft.expected === null || day > today) return;
    logDailyReview({ day, expected: draft.expected, reason: draft.expected ? undefined : draft.reason || undefined, tomorrow: draft.tomorrow.trim() || undefined });
    setDrafts((current) => { const next = { ...current }; delete next[day]; return next; });
    showToast("Daily review recorded");
    if (compact) setExpanded(false);
  }

  return (
    <section className="theme-card rounded-3xl p-4 sm:p-6" aria-label="End-of-day review">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="theme-muted text-xs font-semibold uppercase tracking-[0.2em]">End-of-day review</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{summary.headline}</h2>
          <p className="theme-muted mt-2 text-sm">A clear picture of {label.toLowerCase()}, built from what you logged.</p>
        </div>
        <span role="status" className="theme-muted rounded-full border border-current/15 px-3 py-1.5 text-xs">
          {drafts[day] ? "Unsaved changes" : entry ? (syncStatus.local === "error" ? "Not saved on this device" : syncStatus.remote === "saved" ? "Review saved" : "Recorded · sync pending") : "Ready when you are"}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2" data-no-pull-refresh="true">
        <button type="button" className={control} aria-label="Review previous day" onClick={() => setDay(shiftDay(day, -1))}>←</button>
        <label className="min-w-0"><span className="sr-only">Review day</span><input aria-label="Review day" type="date" value={day} max={today} onChange={(event) => { const value = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= today) setDay(value); }} className={control + " max-w-full"} /></label>
        <button type="button" className={control} aria-label="Review next day" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))}>→</button>
        {day !== today && <button type="button" className={control} onClick={() => setDay(today)}>Today</button>}
      </div>
      {!hydrated ? <p className="theme-muted mt-5" role="status">Loading your day…</p> : <>
        <div data-guide="daily-summary" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <DayMetric label="Planned tasks" value={summary.tasksTotal ? `${summary.tasksDone}/${summary.tasksTotal}` : "—"} detail={summary.tasksTotal ? "completed" : "No tasks planned"} href="/v2/daily?mode=backlog" />
          <DayMetric label="Habits" value={summary.habitsTotal ? `${summary.habitsDone}/${summary.habitsTotal}` : "—"} detail={summary.habitsTotal ? `${summary.habitsSkipped} skipped · ${summary.habitsUnlogged} unlogged` : "No habits for this day"} href="/v2/habits" />
          <DayMetric label="Mood" value={summary.mood === null ? "—" : `${summary.mood.toFixed(1)}/10`} detail={summary.mood === null ? "No check-in" : `Average of ${summary.moodCount} check-in${summary.moodCount === 1 ? "" : "s"}`} href="/v2/mood" />
          <DayMetric label="Sleep" value={summary.sleepMinutes === null ? "—" : `${(summary.sleepMinutes / 60).toFixed(1)}h`} detail={summary.sleepMinutes === null ? "Not logged" : "Latest sleep entry"} href="/v2/sleep" />
        </div>
        {summary.priority && <p className="theme-muted mt-4 text-sm"><span className="font-semibold">Main priority {summary.priorityDone ? "✓" : "·"}</span> <span className="theme-text">{summary.priority.text}</span></p>}
        {!summary.hasData && <p className="theme-muted mt-4 text-sm">There isn’t much logged yet. You can still reflect below; missing entries aren’t treated as a bad day.</p>}
        {summary.insights.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2" data-guide="daily-insights">
          {summary.insights.slice(0, compact && !expanded ? 2 : 4).map((insight) => <DailyInsightCard key={insight.title} insight={insight} />)}
        </div>}
        {entry && !expanded && <div className="theme-workspace-subtle mt-4 rounded-2xl border p-4">
          <p className="text-sm font-medium">{entry.expected ? "The day went as expected." : "The day took a different direction."}</p>
          {entry.tomorrow && <p className="theme-muted mt-2 text-sm"><span className="font-medium">Tomorrow:</span> {entry.tomorrow}</p>}
        </div>}
        {compact && !expanded ? <button type="button" className="theme-button-primary mt-5 min-h-11 rounded-xl px-5 py-3 text-sm font-semibold" onClick={() => setExpanded(true)}>{entry ? "Edit reflection" : "Reflect on this day"}</button> :
          <form data-guide="review-form" className="mt-6 space-y-5 border-t border-current/10 pt-5" onSubmit={save}>
            <fieldset data-guide="review-expectation">
              <legend className="text-sm font-semibold">Did the day go as you expected?</legend>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[{ value: true, label: "Yes, mostly" }, { value: false, label: "Not quite" }].map((option) => <button key={option.label} type="button" aria-pressed={draft.expected === option.value} className={(draft.expected === option.value ? "theme-button-primary" : "theme-button-secondary") + " min-h-12 rounded-xl px-4 py-3 text-sm font-medium"} onClick={() => update({ expected: option.value, ...(option.value ? { reason: "" } : {}) })}>{option.label}</button>)}
              </div>
              {draft.expected === null && <p className="theme-muted mt-2 text-xs">Choose one to save your reflection.</p>}
            </fieldset>
            {draft.expected === false && <fieldset>
              <legend className="text-sm font-semibold">What got in the way? <span className="theme-muted font-normal">Optional</span></legend>
              <div className="mt-3 grid grid-cols-2 gap-2">{reasons.map((reason) => <button type="button" key={reason.id} aria-pressed={draft.reason === reason.id} onClick={() => update({ reason: draft.reason === reason.id ? "" : reason.id })} className={(draft.reason === reason.id ? "theme-button-primary" : "theme-button-secondary") + " min-h-11 rounded-xl px-3 py-2 text-left text-sm"}>{reason.label}</button>)}</div>
            </fieldset>}
            <label data-guide="review-tomorrow" className="grid gap-2 text-sm font-semibold">One thing to carry into tomorrow <span className="theme-muted text-xs font-normal">Keep it small. This is a note, not another task.</span>
              <textarea value={draft.tomorrow} onChange={(event) => update({ tomorrow: event.target.value })} rows={3} maxLength={2000} placeholder="What would make tomorrow a little better?" className="theme-input w-full resize-y rounded-2xl border p-3 text-base font-normal" />
            </label>
            {!draft.tomorrow.trim() && summary.hasData && <button type="button" onClick={() => update({ tomorrow: summary.tomorrowSuggestion })} className="theme-button-secondary min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm">Use suggestion: {summary.tomorrowSuggestion}</button>}
            <div className="flex flex-wrap items-center gap-3">
              <button data-guide="review-save" type="submit" disabled={draft.expected === null || !hydrated || day > today} className="theme-button-primary min-h-11 rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{entry ? "Update daily review" : "Save daily review"}</button>
              {compact && <button type="button" className={control} onClick={() => setExpanded(false)}>Collapse</button>}
              <p className="theme-muted text-xs">Your logs stay as they are.</p>
            </div>
          </form>}
      </>}
    </section>
  );
}

function DailyInsightCard({ insight }: { insight: DailyInsight }) {
  const className = "theme-workspace-subtle block rounded-2xl border p-3 transition hover:border-cyan-400/50 sm:p-4";
  const content = <>
    <p className="text-sm font-semibold">{insight.tone === "positive" ? "✓ " : ""}{insight.title}</p>
    <p className="theme-muted mt-1.5 text-sm leading-relaxed">{insight.detail}</p>
    {insight.href && <p className="theme-accent-text mt-3 text-xs font-semibold">Open related log →</p>}
  </>;
  return insight.href ? <Link href={insight.href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

function DayMetric({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return <Link href={href} className="theme-workspace-subtle min-w-0 rounded-2xl border p-3 transition hover:border-cyan-400/50 sm:p-4"><p className="theme-muted text-xs">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="theme-muted mt-1 text-xs leading-relaxed">{detail}</p></Link>;
}
