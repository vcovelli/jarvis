"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  DayKey,
  JournalPrompt,
  JarvisState,
  MoodLog,
  MoodTag,
  OperatingMode,
  DailyReviewReason,
  TodoItem,
  TodoPriority,
  SleepEntry,
  defaultMoodTags,
  getDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";
import { formatTodoTimeWindow } from "@/lib/timeDisplay";
import { useToast } from "@/components/Toast";

const journalPromptCopy: Record<JournalPrompt, string> = {
  morning: "Morning scan: plan + intention",
  priority: "Top priority + blocker",
  free: "Free log",
};
const operatingModeOptions: Array<{ id: OperatingMode; label: string; emoji: string; blurb: string }> = [
  { id: "deep-work", label: "Deep Work", emoji: "🧠", blurb: "Protect long, focused blocks." },
  { id: "execution", label: "Execution", emoji: "⚡", blurb: "Ship tasks fast and clean." },
  { id: "recovery", label: "Recovery", emoji: "🧘", blurb: "Recharge and protect energy." },
  { id: "maintenance", label: "Maintenance", emoji: "🧭", blurb: "Keep the system stable." },
  { id: "push-day", label: "Push Day", emoji: "🔥", blurb: "Stretch into a hard push." },
];
const reviewReasonOptions: Array<{ id: DailyReviewReason; label: string }> = [
  { id: "overplanned", label: "Overplanned" },
  { id: "low-energy", label: "Low energy" },
  { id: "distraction", label: "Distraction" },
  { id: "external-interruption", label: "External interruption" },
];
type FocusKey = "mood" | "journal" | "todos" | "timeline" | "mustwin";
type TimelineFilter = "all" | "today";
type OperatingModeSuggestion = {
  mode: OperatingMode;
  reason: string;
  context: {
    sleepHours: number | null;
    moodScore: number | null;
    stressTagged: boolean;
    taskCount: number;
  };
};
type PanelKey = "mood" | "timeline" | "todos" | "journal";
const PANEL_PREF_KEY = "jarvis-panel-preferences";
const TIMELINE_FILTER_KEY = "jarvis-timeline-filter";

export default function Home() {
  const {
    state,
    hydrated,
    logMood,
    addMoodTag,
    deleteMoodTag,
    renameMoodTag,
    addJournal,
    toggleTodo,
    updateTodoPriority,
    setOperatingMode,
    setMustWin,
    toggleMustWin,
    logDailyReview,
  } = useJarvisState();
  const { showToast } = useToast();
  const search = useSearchParams();
  const focusParam = search?.get("focus");
  const focusableKeys: FocusKey[] = ["mood", "journal", "todos", "timeline", "mustwin"];
  const focusKey = (focusParam && focusableKeys.find((key) => key === focusParam)) || null;
  const moodPanelRef = useRef<HTMLDivElement>(null);
  const journalPanelRef = useRef<HTMLDivElement>(null);
  const todosPanelRef = useRef<HTMLDivElement>(null);
  const timelinePanelRef = useRef<HTMLDivElement>(null);
  const mustWinPanelRef = useRef<HTMLDivElement>(null);
  const highlightClass = "ring-2 ring-cyan-300/70 shadow-[0_0_35px_rgba(8,145,178,0.3)]";

  const todayKey = getDayKey();
  const todaysTodos = state.todos[todayKey] ?? [];
  const todaysJournal = state.journal[todayKey] ?? [];
  const todaysMood = state.mood[todayKey] ?? [];
  const todaysSleep = state.sleep[todayKey] ?? [];
  const todaysOperatingMode = state.operatingMode[todayKey];
  const todaysMustWin = state.mustWin[todayKey];
  const todaysReview = state.dailyReview[todayKey];

  const [moodValue, setMoodValue] = useState(5);
  const [moodNote, setMoodNote] = useState("");
  const [selectedMoodTags, setSelectedMoodTags] = useState<MoodTag[]>([]);
  const [journalText, setJournalText] = useState("");
  const [journalPrompt, setJournalPrompt] =
    useState<JournalPrompt | undefined>();

  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [mustWinText, setMustWinText] = useState("");
  const [mustWinTime, setMustWinTime] = useState("");
  const [reviewManuallyOpenedDay, setReviewManuallyOpenedDay] = useState<DayKey | null>(null);
  const [reviewDismissedDay, setReviewDismissedDay] = useState<DayKey | null>(null);
  const [reviewExpected, setReviewExpected] = useState<boolean | null>(null);
  const [reviewReason, setReviewReason] = useState<DailyReviewReason | "">("");
  const [reviewTomorrow, setReviewTomorrow] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");
  const [collapsedPanels, setCollapsedPanels] = useState<Partial<Record<PanelKey, boolean>>>({});
  const [panelPrefsLoaded, setPanelPrefsLoaded] = useState(false);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
  const handleTimelineFilterChange = useCallback((value: TimelineFilter) => {
    setTimelineFilter(value);
    try {
      window.localStorage.setItem(TIMELINE_FILTER_KEY, value);
    } catch (error) {
      console.warn("Timeline filter save failed", error);
    }
  }, []);

  const timelineEntries = useMemo(
    () => buildTimeline(state, timelineFilter === "today"),
    [state, timelineFilter],
  );
  const latestMood = useMemo(() => getLatestMood(state), [state]);
  const trendStats = useMemo(() => buildTrendStats(state), [state]);
  const moodTrend = trendStats.mood;
  const sleepTrend = trendStats.sleep;
  const mustWinStats = trendStats.mustWin;
  const streak = useMemo(() => calculateStreak(state), [state]);
  const hasMoodToday = todaysMood.length > 0;
  const hasJournalToday = todaysJournal.length > 0;
  const hasTodoDoneToday = todaysTodos.some((todo) => todo.done);
  const hasMustWinDone = Boolean(todaysMustWin?.done);
  const allTodosDone = todaysTodos.length > 0 && todaysTodos.every((todo) => todo.done);
  const suggestedMode = useMemo(
    () => getOperatingModeSuggestion({ mood: todaysMood, todos: todaysTodos, sleep: todaysSleep }),
    [todaysMood, todaysTodos, todaysSleep],
  );
  const suggestions = useMemo(
    () =>
      buildSuggestions({
        hasMood: hasMoodToday,
        hasJournal: hasJournalToday,
        hasTodoDone: hasTodoDoneToday,
        hasMustWinDone,
      }),
    [hasMoodToday, hasJournalToday, hasTodoDoneToday, hasMustWinDone],
  );
  const moodTagLibrary = useMemo(() => state.moodTags ?? [], [state.moodTags]);
  const moodTagOptions: MoodTag[] = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...defaultMoodTags, ...moodTagLibrary];
    return combined.filter((tag) => {
      const normalized = tag.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [moodTagLibrary]);
  const builtInMoodTagSet = useMemo(
    () => new Set(defaultMoodTags.map((tag) => tag.toLowerCase())),
    [],
  );
  const activeOperatingMode = todaysOperatingMode?.mode ?? suggestedMode?.mode ?? null;
  const operatingModeMetrics = useMemo(() => {
    if (!suggestedMode) return null;
    const { context } = suggestedMode;
    return {
      sleep:
        context.sleepHours !== null
          ? `${context.sleepHours.toFixed(1)}h`
          : "—",
      mood:
        context.moodScore !== null
          ? `${context.moodScore}/10${context.stressTagged ? " + stress" : ""}`
          : "—",
      load: `${context.taskCount} task${context.taskCount === 1 ? "" : "s"}`,
    };
  }, [suggestedMode]);
  const manualReviewOpen = reviewManuallyOpenedDay === todayKey;
  const reviewDismissed = reviewDismissedDay === todayKey;
  const shouldAutoOpenReview = useMemo(() => {
    if (todaysReview) return false;
    if (allTodosDone) return true;
    const now = new Date();
    const cutoff = new Date();
    cutoff.setHours(21, 30, 0, 0);
    return now >= cutoff;
  }, [todaysReview, allTodosDone]);
  const reviewOpen = !reviewDismissed && (manualReviewOpen || shouldAutoOpenReview);
  const moodPanelCollapsed = Boolean(collapsedPanels.mood);
  const timelinePanelCollapsed = Boolean(collapsedPanels.timeline);
  const todosPanelCollapsed = Boolean(collapsedPanels.todos);
  const journalPanelCollapsed = Boolean(collapsedPanels.journal);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PANEL_PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<PanelKey, boolean>>;
        setCollapsedPanels(parsed);
      }
    } catch (error) {
      console.warn("Panel preferences load failed", error);
    } finally {
      setPanelPrefsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!panelPrefsLoaded) return;
    try {
      window.localStorage.setItem(PANEL_PREF_KEY, JSON.stringify(collapsedPanels));
    } catch (error) {
      console.warn("Panel preferences save failed", error);
    }
  }, [collapsedPanels, panelPrefsLoaded]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TIMELINE_FILTER_KEY);
      if (raw === "all" || raw === "today") {
        setTimelineFilter(raw);
      }
    } catch (error) {
      console.warn("Timeline filter load failed", error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TIMELINE_FILTER_KEY, timelineFilter);
    } catch (error) {
      console.warn("Timeline filter save failed", error);
    }
  }, [timelineFilter]);

  useEffect(() => {
    if (!focusKey) return;
    const map: Record<FocusKey, React.RefObject<HTMLDivElement>> = {
      mood: moodPanelRef,
      journal: journalPanelRef,
      todos: todosPanelRef,
      timeline: timelinePanelRef,
      mustwin: mustWinPanelRef,
    };
    const target = map[focusKey]?.current;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusKey]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading console…</p>;
  }

  function handleMoodSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    logMood({ mood: moodValue, note: moodNote, tags: selectedMoodTags });
    setMoodValue(5);
    setMoodNote("");
    setSelectedMoodTags([]);
    showToast("Mood logged");
  }

  function handleJournalSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = journalText.trim();
    if (!trimmed) return;
    addJournal({ text: trimmed, prompt: journalPrompt });
    setJournalText("");
    setJournalPrompt(undefined);
    showToast("Journal saved");
  }


  function handleOperatingModeSelect(mode: OperatingMode) {
    setOperatingMode({ day: todayKey, mode, suggestedMode: suggestedMode?.mode });
    showToast("Operating mode locked");
  }

  function handleMustWinSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = mustWinText.trim();
    if (!trimmed) return;
    setMustWin({ day: todayKey, text: trimmed, timeBound: mustWinTime || undefined });
    setMustWinText("");
    setMustWinTime("");
    showToast("Must Win locked");
  }

  function handleReviewSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (reviewExpected === null) return;
    logDailyReview({
      day: todayKey,
      expected: reviewExpected,
      reason: reviewExpected
        ? undefined
        : reviewReason
          ? (reviewReason as DailyReviewReason)
          : undefined,
      tomorrow: reviewTomorrow,
    });
    setReviewExpected(null);
    setReviewReason("");
    setReviewTomorrow("");
    setReviewManuallyOpenedDay(null);
    setReviewDismissedDay(todayKey);
    showToast("Review saved");
  }

  function togglePanelCollapse(panel: PanelKey) {
    setCollapsedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }));
  }

  function toggleMoodTag(tag: MoodTag) {
    setSelectedMoodTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  }

  function handleAddMoodTag(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const trimmed = newTagValue.trim();
    if (!trimmed) return;
    addMoodTag({ tag: trimmed });
    setNewTagValue("");
    setTagManagerOpen(false);
    showToast("Mood tag added");
  }

  function handleRenameMoodTag(tag: string) {
    const next = window.prompt("Rename tag", tag);
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === tag) return;
    renameMoodTag({ from: tag, to: trimmed });
    showToast("Mood tag updated");
  }

  function handleDeleteMoodTag(tag: string) {
    const confirmed = window.confirm(`Remove "${tag}" from quick tags?`);
    if (!confirmed) return;
    deleteMoodTag({ tag });
    showToast("Mood tag removed");
  }

  return (
    <div className="flex flex-col gap-8 pb-32 sm:pb-10">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
          Jarvis Mode / v1 draft
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
          Daily Systems Console
        </h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Mood + journal + todos in one HUD so the future chat agent can plug in
          without rewrites.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">Operating Mode</h2>
              <p className="mt-1 text-sm text-zinc-300">
                Auto-suggested from sleep, mood, and workload. You can override it.
              </p>
            </div>
            {suggestedMode && (
              <span className="rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100">
                Suggested: {labelForOperatingMode(suggestedMode.mode)}
              </span>
            )}
          </div>
          {suggestedMode && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-zinc-300">
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/80">Auto logic</p>
              <p className="mt-1 text-sm text-white">{suggestedMode.reason}</p>
              {operatingModeMetrics && (
                <div className="mt-3 flex flex-wrap gap-4 text-[11px] uppercase tracking-[0.3em] text-zinc-400">
                  <span>Sleep: {operatingModeMetrics.sleep}</span>
                  <span>Mood: {operatingModeMetrics.mood}</span>
                  <span>Load: {operatingModeMetrics.load}</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {operatingModeOptions.map((option) => {
              const active = activeOperatingMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleOperatingModeSelect(option.id)}
                  className={`flex items-start gap-4 rounded-2xl border px-4 py-3 text-left transition ${
                    active
                      ? "border-cyan-300/70 bg-cyan-300/10 text-white"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-cyan-300/40"
                  }`}
                >
                  <span className="text-2xl">{option.emoji}</span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{option.label}</span>
                    <span className="block text-xs uppercase tracking-[0.2em] text-zinc-400">
                      {option.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={mustWinPanelRef}
          className={`glass-panel rounded-3xl border border-amber-300/40 bg-gradient-to-br from-amber-500/10 via-white/5 to-rose-500/10 p-6 backdrop-blur-lg min-w-0 ${
            focusKey === "mustwin" ? highlightClass : ""
          }`}
        >
          <h2 className="text-lg font-medium text-white">Top 1 Must Win</h2>
          <p className="mt-1 text-sm text-zinc-300">
            One binary outcome that anchors the day.
          </p>
          {todaysMustWin ? (
            <div className="mt-6 rounded-2xl border border-amber-400/50 bg-black/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{todaysMustWin.text}</p>
                  {todaysMustWin.timeBound && (
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-amber-200">
                      By {todaysMustWin.timeBound}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleMustWin({ day: todayKey })}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] whitespace-nowrap ${
                    todaysMustWin.done
                      ? "bg-emerald-400 text-emerald-950"
                      : "bg-amber-300 text-amber-950"
                  }`}
                >
                  {todaysMustWin.done ? "Won" : "Mark done"}
                </button>
              </div>
            </div>
          ) : (
            <form className="mt-6 space-y-3" onSubmit={handleMustWinSubmit}>
              <input
                value={mustWinText}
                onChange={(event) => setMustWinText(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                placeholder="What must happen today?"
              />
              <input
                value={mustWinTime}
                onChange={(event) => setMustWinTime(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                placeholder="Time-bound (e.g. by 3:00pm)"
              />
              <button
                type="submit"
                className="w-full rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-950"
              >
                Lock the day
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div
          ref={moodPanelRef}
          className={`glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg ${focusKey === "mood" ? highlightClass : ""}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">Mood Check-in</h2>
              <p className="mt-1 text-sm text-zinc-300">
                Slider, note, and quick tags. Takes 60 seconds.
              </p>
            </div>
            <button
              type="button"
              onClick={() => togglePanelCollapse("mood")}
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70"
              aria-label={moodPanelCollapsed ? "Expand mood panel" : "Collapse mood panel"}
            >
              {moodPanelCollapsed ? "↓" : "↑"}
            </button>
          </div>
          {!moodPanelCollapsed ? (
            <form className="mt-6 flex flex-col gap-5" onSubmit={handleMoodSubmit}>
              <label className="text-sm font-medium text-zinc-200">
                Mood: <span className="text-cyan-300">{moodValue}/10</span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={moodValue}
                onChange={(event) => setMoodValue(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded bg-zinc-700 accent-cyan-300"
              />
              <div className="flex flex-wrap gap-2">
              {moodTagOptions.map((tag) => {
                const active = selectedMoodTags.includes(tag);
                const normalized = tag.toLowerCase();
                const isCustom = !builtInMoodTagSet.has(normalized);
                return (
                  <div key={tag} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleMoodTag(tag)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${active ? "bg-cyan-300 text-zinc-900" : "bg-white/10 text-zinc-300"}`}
                    >
                      {tag}
                    </button>
                    {tagManagerOpen && isCustom && (
                      <div className="absolute -top-2 -right-2 flex gap-1 rounded-full bg-black/60 px-1 py-0.5">
                        <button
                          type="button"
                          onClick={() => handleRenameMoodTag(tag)}
                          className="text-[10px] text-cyan-200 hover:text-white"
                          aria-label={`Rename ${tag}`}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMoodTag(tag)}
                          className="text-[10px] text-rose-300 hover:text-white"
                          aria-label={`Delete ${tag}`}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setTagManagerOpen((prev) => !prev)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${tagManagerOpen ? "bg-cyan-300/20 text-cyan-100" : "bg-white/10 text-zinc-400"}`}
              >
                {tagManagerOpen ? "Done" : "+ Tag"}
              </button>
            </div>
            {tagManagerOpen && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={newTagValue}
                  onChange={(event) => setNewTagValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddMoodTag();
                    }
                  }}
                  className="flex-1 min-w-[180px] rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-zinc-500"
                  placeholder="e.g. calm, foggy, dialed"
                />
                <button
                  type="button"
                  onClick={() => handleAddMoodTag()}
                  className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900"
                >
                  Add
                </button>
              </div>
            )}
            <textarea
              placeholder="Anything notable?"
              value={moodNote}
              onChange={(event) => setMoodNote(event.target.value)}
              rows={4}
              className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-cyan-400 via-indigo-400 to-blue-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90"
            >
              Log check-in
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">Mood check-in hidden. Tap expand to log again.</p>
        )}
        </div>

        <TimelinePanel
          wrapperRef={timelinePanelRef}
          entries={timelineEntries}
          filter={timelineFilter}
          onFilterChange={handleTimelineFilterChange}
          className={focusKey === "timeline" ? highlightClass : ""}
          collapsed={timelinePanelCollapsed}
          onToggleCollapse={() => togglePanelCollapse("timeline")}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <TodosPanel
          panelRef={todosPanelRef}
          className={focusKey === "todos" ? highlightClass : ""}
          todos={todaysTodos}
          toggleTodo={(id) => toggleTodo({ day: todayKey, id })}
          updatePriority={(id, priority) =>
            updateTodoPriority({ day: todayKey, id, priority })
          }
          collapsed={todosPanelCollapsed}
          onToggleCollapse={() => togglePanelCollapse("todos")}
        />

        <JournalPanel
          panelRef={journalPanelRef}
          className={focusKey === "journal" ? highlightClass : ""}
          journalText={journalText}
          setJournalText={setJournalText}
          prompt={journalPrompt}
          onPromptSelect={(prompt) => {
            setJournalPrompt(prompt);
            if (!journalText) {
              setJournalText(`${journalPromptCopy[prompt]} — `);
            }
          }}
          onSubmit={handleJournalSubmit}
          collapsed={journalPanelCollapsed}
          onToggleCollapse={() => togglePanelCollapse("journal")}
        />
      </section>

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

      <section className={`grid gap-6 md:grid-cols-2 lg:grid-cols-4 ${mobileInsightsOpen ? "lg:grid" : "hidden lg:grid"}`}>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Mood signal</h2>
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <div>
              <span className="text-4xl font-semibold text-white">
                {moodTrend.today !== null ? moodTrend.today : "–"}
              </span>
              <span className="ml-2 text-sm text-zinc-300">today</span>
            </div>
            <div className="text-right text-xs uppercase tracking-[0.3em] text-zinc-400">
              <p>7d avg</p>
              <p className="text-sm text-white">
                {moodTrend.average !== null ? moodTrend.average.toFixed(1) : "–"}/10
              </p>
              <p className="text-[11px] text-cyan-200">
                {formatDeltaText(moodTrend.delta, "")}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-300">
            {latestMood
              ? latestMood.note || "Logged without a note."
              : "No entries logged yet. Add one to kick things off."}
          </p>
        </div>

        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Sleep trend</h2>
          <div className="mt-4 flex items-baseline justify-between gap-4">
            <div>
              <span className="text-4xl font-semibold text-white">
                {sleepTrend.today !== null ? `${sleepTrend.today.toFixed(1)}h` : "–"}
              </span>
              <span className="ml-2 text-sm text-zinc-300">last log</span>
            </div>
            <div className="text-right text-xs uppercase tracking-[0.3em] text-zinc-400">
              <p>7d avg</p>
              <p className="text-sm text-white">
                {sleepTrend.average !== null ? `${sleepTrend.average.toFixed(1)}h` : "–"}
              </p>
              <p className="text-[11px] text-cyan-200">
                {formatDeltaText(sleepTrend.delta, "h")}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-zinc-300">
            Aim for at least 6.5h to unlock Deep Work and streak wins.
          </p>
        </div>

        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Streak</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Mood or sleep logged + Must Win done.
          </p>
          <div className="mt-6 flex items-end gap-2">
            <span className="text-5xl font-semibold text-cyan-200">{streak}</span>
            <span className="text-sm text-zinc-400">days</span>
          </div>
          <p className="mt-3 text-sm text-zinc-300">
            Must Win pacing: {mustWinStats.wonDays}/{mustWinStats.lockedDays} locked this week.
          </p>
        </div>

        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Up Next</h2>
          <ul className="mt-4 space-y-3 text-sm text-zinc-300">
            {suggestions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-white">End-of-day Review</h2>
            <p className="mt-1 text-sm text-zinc-300">
              30-second reflection to close the loop.
            </p>
          </div>
          {!todaysReview && (
            <button
              type="button"
              onClick={() => {
                setReviewManuallyOpenedDay(todayKey);
                setReviewDismissedDay(null);
              }}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white"
            >
              Start review
            </button>
          )}
        </div>
        {todaysReview ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-200">
            <p className="font-semibold text-white">
              {todaysReview.expected ? "On track as expected." : "Did not go as planned."}
            </p>
            {!todaysReview.expected && todaysReview.reason && (
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-400">
                Reason: {todaysReview.reason.replace("-", " ")}
              </p>
            )}
            {todaysReview.tomorrow && (
              <p className="mt-3 text-sm text-zinc-300">
                Tomorrow will be better if I {todaysReview.tomorrow}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-400">
            You will be prompted after the last task or at 9:30pm.
          </p>
        )}
      </section>

      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0b1326] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">30-second review</h3>
                <p className="mt-1 text-sm text-zinc-300">
                  Capture the signal before it fades.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReviewManuallyOpenedDay(null);
                  setReviewDismissedDay(todayKey);
                }}
                className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70"
              >
                Close
              </button>
            </div>
            <form className="mt-6 space-y-5" onSubmit={handleReviewSubmit}>
              <div>
                <p className="text-sm font-semibold text-white">Did today go as expected?</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setReviewExpected(option.value);
                        if (option.value) setReviewReason("");
                      }}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] ${
                        reviewExpected === option.value
                          ? "border-cyan-300/70 bg-cyan-300/20 text-white"
                          : "border-white/10 text-zinc-300"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {reviewExpected === false && (
                <div>
                  <p className="text-sm font-semibold text-white">Main reason</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {reviewReasonOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setReviewReason(option.id)}
                        className={`rounded-2xl border px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] ${
                          reviewReason === option.id
                            ? "border-rose-300/70 bg-rose-300/10 text-white"
                            : "border-white/10 text-zinc-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">Tomorrow will be better if I…</p>
                <textarea
                  value={reviewTomorrow}
                  onChange={(event) => setReviewTomorrow(event.target.value)}
                  rows={3}
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                  placeholder="Finish the sentence."
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900"
              >
                Save review
              </button>
            </form>
          </div>
        </div>
      )}
      <nav
        aria-label="Quick actions"
        className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-3xl border border-white/10 bg-black/50 p-3 backdrop-blur-xl sm:hidden"
      >
        <div className="grid grid-cols-4 gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
          <QuickNavLink href="/v2?focus=mood" label="Mood" emoji="😊" attention={!hasMoodToday} />
          <QuickNavLink
            href="/v2?focus=mustwin"
            label="Must Win"
            emoji="🎯"
            attention={!todaysMustWin?.done}
          />
          <QuickNavLink
            href="/v2?focus=todos"
            label="Todos"
            emoji="📋"
            attention={todaysTodos.length === 0 || !hasTodoDoneToday}
          />
          <QuickNavLink
            href="/v2/review"
            label="Review"
            emoji="📈"
            attention={!todaysReview}
          />
        </div>
      </nav>
    </div>
  );
}

type TimelineEntry = {
  id: string;
  ts: number;
  title: string;
  detail: string;
  badge: string;
  icon: string;
  href: string;
  dayKey: DayKey;
  timeLabel: string;
};

function getOperatingModeSuggestion(args: {
  mood: MoodLog[];
  todos: TodoItem[];
  sleep: SleepEntry[];
}): OperatingModeSuggestion {
  const latestSleep = args.sleep.slice().sort((a, b) => b.ts - a.ts)[0];
  const latestMood = args.mood.slice().sort((a, b) => b.ts - a.ts)[0];
  const sleepHours = latestSleep ? latestSleep.durationMins / 60 : null;
  const moodScore = latestMood?.mood ?? null;
  const stressTagged = latestMood?.tags?.includes("stress") ?? false;
  const taskCount = args.todos.length;
  const context = { sleepHours, moodScore, stressTagged, taskCount };

  if (sleepHours !== null && sleepHours < 6.5) {
    return {
      mode: "recovery",
      reason: `Last sleep logged at ${sleepHours.toFixed(1)}h (<6.5h). Protect energy.`,
      context,
    };
  }
  if (moodScore !== null && moodScore >= 8 && !stressTagged) {
    return {
      mode: "deep-work",
      reason: "Energy is high and stress is low — carve deep blocks.",
      context,
    };
  }
  if (moodScore !== null && moodScore <= 4 && taskCount >= 3) {
    return {
      mode: "maintenance",
      reason: "Mood is trending low while workload is heavy. Keep things stable.",
      context,
    };
  }
  if (taskCount >= 5) {
    return {
      mode: "execution",
      reason: `${taskCount} tasks queued. Move fast and clear the board.`,
      context,
    };
  }
  return {
    mode: "maintenance",
    reason:
      moodScore === null && sleepHours === null && taskCount === 0
        ? "Need more logs, so defaulting to Maintenance until data lands."
        : "Maintain systems and keep inputs steady today.",
    context,
  };
}

type TrendStats = {
  mood: {
    today: number | null;
    average: number | null;
    delta: number | null;
  };
  sleep: {
    today: number | null;
    average: number | null;
    delta: number | null;
  };
  mustWin: {
    lockedDays: number;
    wonDays: number;
    rangeDays: number;
  };
};

function buildTrendStats(state: JarvisState, rangeDays = 7): TrendStats {
  const dayKeys = getLastNDays(rangeDays);
  const moodValues: number[] = [];
  const sleepValues: number[] = [];
  let todayMood: number | null = null;
  let todaySleep: number | null = null;
  let mustWinLocked = 0;
  let mustWinWon = 0;

  dayKeys.forEach((day, index) => {
    const moodLogs = state.mood[day] ?? [];
    if (moodLogs.length) {
      const latest = moodLogs.slice().sort((a, b) => b.ts - a.ts)[0];
      moodValues.push(latest.mood);
      if (index === dayKeys.length - 1) {
        todayMood = latest.mood;
      }
    }

    const sleepLogs = state.sleep[day] ?? [];
    if (sleepLogs.length) {
      const latestSleep = sleepLogs.slice().sort((a, b) => b.ts - a.ts)[0];
      const hours = latestSleep.durationMins / 60;
      sleepValues.push(hours);
      if (index === dayKeys.length - 1) {
        todaySleep = hours;
      }
    }

    const mustWin = state.mustWin[day];
    if (mustWin) {
      mustWinLocked += 1;
      if (mustWin.done) {
        mustWinWon += 1;
      }
    }
  });

  const moodAverage = moodValues.length ? average(moodValues) : null;
  const sleepAverage = sleepValues.length ? average(sleepValues) : null;

  return {
    mood: {
      today: todayMood,
      average: moodAverage,
      delta: todayMood !== null && moodAverage !== null ? todayMood - moodAverage : null,
    },
    sleep: {
      today: todaySleep,
      average: sleepAverage,
      delta: todaySleep !== null && sleepAverage !== null ? todaySleep - sleepAverage : null,
    },
    mustWin: {
      lockedDays: mustWinLocked,
      wonDays: mustWinWon,
      rangeDays,
    },
  };
}

function getLastNDays(count = 7): DayKey[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - index));
    return getDayKey(date);
  });
}

function labelForOperatingMode(mode: OperatingMode): string {
  const match = operatingModeOptions.find((option) => option.id === mode);
  return match ? match.label : mode;
}

function buildTimeline(state: JarvisState, todayOnly = false, limit = 8): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const todayKey = getDayKey();

  Object.entries(state.mood).forEach(([day, logs]) => {
    logs.forEach((log) =>
      entries.push({
        id: `mood-${log.id}`,
        ts: log.ts,
        title: log.note || "Mood check-in",
        detail:
          `Mood ${log.mood}/10` + (log.tags?.length ? ` • ${log.tags.join(", ")}` : ""),
        badge: "Mood",
        icon: "😊",
        href: "/v2?focus=mood",
        dayKey: day as DayKey,
        timeLabel: formatTimelineTime(log.ts),
      }),
    );
  });

  Object.entries(state.journal).forEach(([day, entriesForDay]) => {
    entriesForDay.forEach((entry) =>
      entries.push({
        id: `journal-${entry.id}`,
        ts: entry.ts,
        title: entry.text.slice(0, 80) + (entry.text.length > 80 ? "…" : ""),
        detail: entry.prompt ? `${entry.prompt} journal` : "Journal entry",
        badge: "Journal",
        icon: "📝",
        href: `/v2/journal?day=${day}&focus=${entry.id}`,
        dayKey: day as DayKey,
        timeLabel: formatTimelineTime(entry.ts),
      }),
    );
  });

  Object.entries(state.todos).forEach(([day, todos]) => {
    todos.forEach((todo) => {
      if (!todo.done && !todo.timeblockMins) return;
      const plannedWindow = todo.startTime ? formatTodoTimeWindow(todo) : undefined;
      const actualTime = todo.completedTs ? formatTimelineTime(todo.completedTs) : undefined;
      entries.push({
        id: `todo-${todo.id}`,
        ts: todo.completedTs ?? todo.createdTs,
        title: todo.text,
        detail: todo.done
          ? `${plannedWindow ? `Planned ${plannedWindow} • ` : ""}Actual ${actualTime ?? "Logged"} • P${todo.priority}`
          : `${plannedWindow ? `Planned ${plannedWindow} • ` : ""}${todo.timeblockMins ? `${todo.timeblockMins}m block` : "Planned task"} • P${todo.priority}`,
        badge: "Todo",
        icon: "📋",
        href: `/v2/todos?day=${day}&focus=${todo.id}`,
        dayKey: day as DayKey,
        timeLabel: formatTimelineTime(todo.completedTs ?? todo.createdTs),
      });
    });
  });

  Object.entries(state.sleep).forEach(([day, nights]) => {
    nights.forEach((night) =>
      entries.push({
        id: `sleep-${night.id}`,
        ts: night.ts,
        title: `${(night.durationMins / 60).toFixed(1)}h sleep`,
        detail: `Quality ${night.quality}/5`,
        badge: "Sleep",
        icon: "🌙",
        href: `/v2/sleep?day=${day}&focus=${night.id}`,
        dayKey: day as DayKey,
        timeLabel: formatTimelineTime(night.ts),
      }),
    );
  });

  Object.entries(state.mustWin).forEach(([day, entry]) => {
    entries.push({
      id: `mustwin-${day}`,
      ts: entry.completedTs ?? entry.ts,
      title: entry.text,
      detail: entry.done
        ? `Must Win completed${entry.timeBound ? ` • by ${entry.timeBound}` : ""}`
        : `Must Win locked${entry.timeBound ? ` • by ${entry.timeBound}` : ""}`,
      badge: "Must Win",
      icon: entry.done ? "🏁" : "🎯",
      href: `/v2?focus=mustwin`,
      dayKey: day as DayKey,
      timeLabel: formatTimelineTime(entry.completedTs ?? entry.ts),
    });
  });

  const sorted = entries.sort((a, b) => b.ts - a.ts);
  const filtered = todayOnly ? sorted.filter((entry) => entry.dayKey === todayKey) : sorted;
  return filtered.slice(0, limit);
}

function formatTimelineTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getLatestMood(state: JarvisState): MoodLog | undefined {
  const all = Object.values(state.mood).flat();
  return all.sort((a, b) => b.ts - a.ts)[0];
}

function calculateStreak(state: JarvisState, windowDays = 30): number {
  let streak = 0;
  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = getDayKey(date);
    const hasMood = (state.mood[key]?.length ?? 0) > 0;
    const hasSleep = (state.sleep[key]?.length ?? 0) > 0;
    const mustWinDone = state.mustWin[key]?.done ?? false;
    if ((hasMood || hasSleep) && mustWinDone) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function buildSuggestions(args: {
  hasMood: boolean;
  hasJournal: boolean;
  hasTodoDone: boolean;
  hasMustWinDone: boolean;
}): string[] {
  const tips: string[] = [];
  if (!args.hasMood) tips.push("Log your mood to keep the streak alive.");
  if (!args.hasJournal) tips.push("Drop a 2-minute journal entry to clear the head.");
  if (!args.hasTodoDone) tips.push("Check off one priority task for the day.");
  if (!args.hasMustWinDone) tips.push("Lock in the Must Win and protect it.");
  if (tips.length < 3) tips.push("Timeblock one todo with a 30m focus block.");
  return tips.slice(0, 3);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDeltaText(value: number | null, unit: string) {
  if (value === null) return "–";
  if (value === 0) return `0${unit} vs avg`;
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}${unit} vs avg`;
}

type TimelinePanelProps = {
  entries: TimelineEntry[];
  filter: TimelineFilter;
  onFilterChange: (value: TimelineFilter) => void;
  wrapperRef?: RefObject<HTMLDivElement>;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function TimelinePanel({
  entries,
  filter,
  onFilterChange,
  wrapperRef,
  className = "",
  collapsed = false,
  onToggleCollapse,
}: TimelinePanelProps) {
  return (
    <div
      ref={wrapperRef}
      className={`glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2 min-w-0 ${className}`}
    >
          <div className="flex flex-wrap items-start gap-4 sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-medium text-white">Timeline</h2>
              <span className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">blended feed</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2 rounded-full border border-white/10 bg-white/5 p-1 text-xs uppercase tracking-[0.3em]">
            {(["all", "today"] as TimelineFilter[]).map((option) => {
              const active = filter === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onFilterChange(option)}
                  className={`rounded-full px-3 py-1 font-semibold transition ${
                    active ? "bg-white text-zinc-900" : "text-zinc-300 hover:text-white"
                  }`}
                >
                  {option === "all" ? "All" : "Today"}
                </button>
              );
            })}
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70"
              aria-label={collapsed ? "Expand timeline" : "Collapse timeline"}
            >
              {collapsed ? "↓" : "↑"}
            </button>
          )}
        </div>
      </div>
      {collapsed ? (
        <p className="mt-6 text-sm text-zinc-400">Timeline hidden. Expand to review your day.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {entries.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No entries yet. Log moods, journal, todos, or sleep to see them populate.
            </p>
          ) : (
            entries.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-black/30 px-4 py-3 transition hover:border-cyan-300/50 hover:bg-black/40 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-1 min-w-0 items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl">
                    {item.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white break-words">{item.title}</p>
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-400 break-words">
                      {item.detail}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-start text-[11px] uppercase tracking-[0.3em] text-zinc-400 sm:items-end sm:text-right">
                  <p>{item.timeLabel}</p>
                  <span className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 font-semibold text-cyan-200">
                    {item.badge}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type QuickNavLinkProps = {
  href: string;
  label: string;
  emoji: string;
  attention?: boolean;
};

function QuickNavLink({ href, label, emoji, attention = false }: QuickNavLinkProps) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 rounded-2xl border px-3 py-2 text-center transition ${
        attention ? "border-cyan-300/60 text-white" : "border-white/10 text-zinc-300"
      }`}
    >
      <span className="text-xl">{emoji}</span>
      <span className="text-[10px] uppercase tracking-[0.3em]">{label}</span>
      {attention && <span className="text-[10px] font-semibold text-cyan-200">✺</span>}
    </Link>
  );
}

type TodosPanelProps = {
  className?: string;
  panelRef?: RefObject<HTMLDivElement>;
  todos: TodoItem[];
  toggleTodo: (id: string) => void;
  updatePriority: (id: string, priority: TodoPriority) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function TodosPanel({ className = "", panelRef, collapsed = false, onToggleCollapse, ...props }: TodosPanelProps) {
  const completedCount = props.todos.filter((todo) => todo.done).length;
  return (
    <div
      ref={panelRef}
      className={`glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2 min-w-0 ${className}`}
    >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-white">Today&apos;s Todos</h2>
            <p className="mt-1 text-sm text-zinc-300">
              {props.todos.length
              ? `${completedCount}/${props.todos.length} completed.`
              : "No tasks yet — add your top three."}
          </p>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70"
            aria-label={collapsed ? "Expand todos" : "Collapse todos"}
          >
            {collapsed ? "↓" : "↑"}
          </button>
        )}
      </div>
      {!collapsed ? (
        <>
          <Link
            href="/v2/todos"
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            Add task
          </Link>

          <div className="mt-6 space-y-3">
            {props.todos.length === 0 ? (
              <p className="text-sm text-zinc-400">No tasks yet. Add your top 3.</p>
            ) : (
              props.todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <label className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 cursor-pointer accent-cyan-300"
                      checked={todo.done}
                      onChange={() => props.toggleTodo(todo.id)}
                    />
                    <div>
                      <p className={`text-sm font-medium break-words ${todo.done ? "text-zinc-400 line-through" : "text-white"}`}>
                        {todo.text}
                      </p>
                      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                        {priorityLabel(todo.priority)}
                        {todo.timeblockMins ? ` • ${todo.timeblockMins}m block` : ""}
                        {todo.startTime ? ` • ${formatTodoTimeWindow(todo)}` : ""}
                        {todo.done && todo.completedTs
                          ? ` • done at ${new Date(todo.completedTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                          : ""}
                      </p>
                    </div>
                  </label>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <button
                      type="button"
                      onClick={() => props.updatePriority(todo.id, nextPriority(todo.priority))}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-200"
                    >
                      {priorityLabel(todo.priority)}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Todos hidden. Expand when you&apos;re ready to plan.</p>
      )}
    </div>
  );
}

type JournalPanelProps = {
  className?: string;
  panelRef?: RefObject<HTMLDivElement>;
  journalText: string;
  setJournalText: (value: string) => void;
  prompt?: JournalPrompt;
  onPromptSelect: (value: JournalPrompt) => void;
  onSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function JournalPanel({
  className = "",
  panelRef,
  collapsed = false,
  onToggleCollapse,
  ...props
}: JournalPanelProps) {
  return (
    <div
      ref={panelRef}
      className={`glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg min-w-0 ${className}`}
    >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-white">Quick Journal</h2>
            <p className="mt-1 text-sm text-zinc-300">
              One paragraph. Clarity &gt; volume.
            </p>
          </div>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/70"
              aria-label={collapsed ? "Expand journal" : "Collapse journal"}
            >
              {collapsed ? "↓" : "↑"}
            </button>
          )}
        </div>
      {!collapsed ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(journalPromptCopy) as JournalPrompt[]).map((prompt) => {
              const active = props.prompt === prompt;
              return (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => props.onPromptSelect(prompt)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${active ? "bg-pink-300 text-zinc-900" : "bg-white/10 text-zinc-200"}`}
                >
                  {prompt}
                </button>
              );
            })}
          </div>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={props.onSubmit}
          >
            <textarea
              value={props.journalText}
              onChange={(event) => props.setJournalText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  props.onSubmit();
                }
              }}
              rows={6}
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              placeholder="What&apos;s the plan? What has your attention?"
            />
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-fuchsia-400 to-purple-500 px-4 py-3 text-sm font-semibold text-white"
            >
              Save entry
            </button>
          </form>
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">Journal hidden. Expand when you want to write.</p>
      )}
    </div>
  );
}

function nextPriority(value: TodoPriority): TodoPriority {
  if (value === 3) return 1;
  return ((value + 1) as TodoPriority);
}

function priorityLabel(priority: TodoPriority) {
  switch (priority) {
    case 1:
      return "High";
    case 2:
      return "Medium";
    case 3:
    default:
      return "Low";
  }
}
