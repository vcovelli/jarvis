"use client";

import Link from "next/link";
import { FormEvent, MouseEvent, ReactNode, TouchEvent, useCallback, useMemo, useRef, useState } from "react";

import { mobileSidebarOpenEvent } from "@/lib/shellEvents";

import {
  DayKey,
  HabitEntry,
  HabitIntent,
  HabitLogStatus,
  dayKeyToDate,
  getDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";

type ViewMode = "week" | "month";
type EditorMode = "create" | "edit" | null;

type HabitDraft = {
  title: string;
  icons: string;
  category: string;
  intent: HabitIntent;
};

type HabitDay = {
  key: DayKey;
  date: Date;
  label: string;
  shortLabel: string;
  dayNumber: string;
  isToday: boolean;
  isSelected: boolean;
};

const habitStarterSet: Array<HabitDraft> = [
  { title: "Drink water, no phone, meditate", icons: "🚫💧🧘", category: "Private", intent: "build" },
  { title: "Get moving", icons: "💪", category: "Fitness", intent: "build" },
  { title: "Plan, execute, repeat", icons: "📝", category: "Work", intent: "build" },
  { title: "Deep focus", icons: "🎯", category: "Work", intent: "build" },
  { title: "Stay ahead", icons: "🎓", category: "Private", intent: "build" },
  { title: "No impulse buys", icons: "🏦", category: "Quit", intent: "quit" },
];

const emptyDraft: HabitDraft = {
  title: "",
  icons: "✓",
  category: "Private",
  intent: "build",
};

const iconPresets = ["✓", "🎯", "💧", "🧘", "💪", "📓", "🧠", "🏦", "🚫", "📈", "🌙", "☀️"];
const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const chainLabels = ["S", "M", "T", "W", "T", "F", "S"];
const SWIPE_THRESHOLD = 92;
const SWIPE_MAX_OFFSET = 54;

type SwipeTracker = {
  tracking: boolean;
  swiping: boolean;
  startX: number;
  startY: number;
  lastDeltaX: number;
  ready: boolean;
};

export default function HabitsPage() {
  const {
    state,
    hydrated,
    addHabit,
    updateHabit,
    deleteHabit,
    recordHabit,
    eraseHabitLog,
  } = useJarvisState();

  const todayKey = getDayKey();
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [editorMode, setEditorMode] = useState<EditorMode>(null);
  const [draft, setDraft] = useState<HabitDraft>(emptyDraft);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDragging, setSwipeDragging] = useState(false);
  const [swipeReady, setSwipeReady] = useState(false);
  const swipeRef = useRef<SwipeTracker>({
    tracking: false,
    swiping: false,
    startX: 0,
    startY: 0,
    lastDeltaX: 0,
    ready: false,
  });
  const suppressSwipeClickRef = useRef(false);

  const orderedHabits = useMemo(() => {
    return [...(state.habits ?? [])]
      .filter((habit) => !habit.archivedTs)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdTs - b.createdTs);
  }, [state.habits]);

  const categories = useMemo(() => {
    const names = orderedHabits
      .map((habit) => habit.category?.trim())
      .filter((category): category is string => Boolean(category));
    return ["All", ...Array.from(new Set(names))];
  }, [orderedHabits]);

  const visibleHabits = useMemo(() => {
    if (categoryFilter === "All") return orderedHabits;
    return orderedHabits.filter((habit) => habit.category === categoryFilter);
  }, [categoryFilter, orderedHabits]);

  const selectedHabit = useMemo(
    () => visibleHabits.find((habit) => habit.id === selectedHabitId) ?? visibleHabits[0] ?? null,
    [selectedHabitId, visibleHabits],
  );

  const visibleDays = useMemo(() => {
    return viewMode === "week"
      ? buildWeekDays(selectedDay, todayKey)
      : buildMonthDays(selectedDay, todayKey);
  }, [selectedDay, todayKey, viewMode]);

  const selectedDate = dayKeyToDate(selectedDay);
  const dayStats = useMemo(() => buildDayStats(visibleHabits, selectedDay), [selectedDay, visibleHabits]);
  const selectedHabitStreak = selectedHabit ? calculateHabitStreak(selectedHabit, selectedDay) : 0;
  const strongestChain = useMemo(() => {
    return visibleHabits.reduce((best, habit) => Math.max(best, calculateHabitStreak(habit, selectedDay)), 0);
  }, [selectedDay, visibleHabits]);
  const completedToday = useMemo(() => buildDayStats(visibleHabits, todayKey).yes, [todayKey, visibleHabits]);

  const selectDay = useCallback((day: DayKey) => {
    setSelectedDay(day);
    pulse(8);
  }, []);

  const shiftDay = useCallback((amount: number) => {
    setSelectedDay((current) => shiftDayKey(current, amount));
    pulse(8);
  }, []);

  const shiftRange = useCallback((amount: number) => {
    setSelectedDay((current) =>
      viewMode === "month" ? shiftMonthKey(current, amount) : shiftDayKey(current, amount * 7),
    );
    pulse([8, 24, 8]);
  }, [viewMode]);

  const resetSwipe = useCallback(() => {
    swipeRef.current = {
      tracking: false,
      swiping: false,
      startX: 0,
      startY: 0,
      lastDeltaX: 0,
      ready: false,
    };
    setSwipeDragging(false);
    setSwipeReady(false);
    setSwipeOffset(0);
  }, []);

  const handleSwipeStart = useCallback((event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe="true"]')) return;
    const touch = event.touches[0];
    swipeRef.current = {
      tracking: true,
      swiping: false,
      startX: touch.clientX,
      startY: touch.clientY,
      lastDeltaX: 0,
      ready: false,
    };
  }, []);

  const handleSwipeMove = useCallback((event: TouchEvent<HTMLElement>) => {
    const tracker = swipeRef.current;
    if (!tracker.tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - tracker.startX;
    const deltaY = touch.clientY - tracker.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!tracker.swiping) {
      if (absY > 14 && absY > absX) {
        resetSwipe();
        return;
      }
      if (absX < 14 || absX < absY * 1.15) return;
      tracker.swiping = true;
      suppressSwipeClickRef.current = true;
      setSwipeDragging(true);
    }

    event.preventDefault();
    tracker.lastDeltaX = deltaX;
    const clamped = Math.max(-SWIPE_THRESHOLD, Math.min(SWIPE_THRESHOLD, deltaX));
    const progress = clamped / SWIPE_THRESHOLD;
    setSwipeOffset(Math.round(progress * SWIPE_MAX_OFFSET));

    const ready = absX >= SWIPE_THRESHOLD;
    if (ready && !tracker.ready) pulse([8, 22, 8]);
    tracker.ready = ready;
    setSwipeReady(ready);
  }, [resetSwipe]);

  const handleSwipeEnd = useCallback(() => {
    const tracker = swipeRef.current;
    if (tracker.swiping && Math.abs(tracker.lastDeltaX) >= SWIPE_THRESHOLD) {
      shiftRange(tracker.lastDeltaX < 0 ? 1 : -1);
    }
    resetSwipe();
    window.setTimeout(() => {
      suppressSwipeClickRef.current = false;
    }, 160);
  }, [resetSwipe, shiftRange]);

  const handleSwipeClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressSwipeClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const openMobileMenu = useCallback(() => {
    window.dispatchEvent(new Event(mobileSidebarOpenEvent));
    pulse(8);
  }, []);

  const openCreate = useCallback(() => {
    setDraft(emptyDraft);
    setEditorMode("create");
    pulse(8);
  }, []);

  const openEdit = useCallback(() => {
    if (!selectedHabit) return;
    setDraft({
      title: selectedHabit.title,
      icons: selectedHabit.icons,
      category: selectedHabit.category ?? "Private",
      intent: selectedHabit.intent,
    });
    setEditorMode("edit");
    pulse(8);
  }, [selectedHabit]);

  const closeEditor = useCallback(() => {
    setEditorMode(null);
    setDraft(emptyDraft);
  }, []);

  const submitHabit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = draft.title.trim();
      if (!title) return;
      const payload = {
        title,
        icons: draft.icons.trim() || "✓",
        category: draft.category.trim() || undefined,
        intent: draft.intent,
      };
      if (editorMode === "edit" && selectedHabit) {
        updateHabit({ id: selectedHabit.id, updates: payload });
        pulse([8, 24, 8]);
      } else {
        addHabit(payload);
        pulse([10, 35, 12]);
      }
      closeEditor();
    },
    [addHabit, closeEditor, draft, editorMode, selectedHabit, updateHabit],
  );

  const deleteSelectedHabit = useCallback(() => {
    if (!selectedHabit) return;
    if (!window.confirm(`Delete ${formatHabitTitle(selectedHabit.title)}?`)) return;
    deleteHabit({ id: selectedHabit.id });
    closeEditor();
    pulse(20);
  }, [closeEditor, deleteHabit, selectedHabit]);

  const addStarters = useCallback(() => {
    habitStarterSet.forEach((habit) => addHabit(habit));
    pulse([10, 30, 10, 30, 18]);
  }, [addHabit]);

  const applyStatus = useCallback(
    (habit: HabitEntry, status: HabitLogStatus | "erase") => {
      setSelectedHabitId(habit.id);
      if (status === "erase") {
        eraseHabitLog({ id: habit.id, day: selectedDay });
        pulse(10);
        return;
      }
      recordHabit({ id: habit.id, day: selectedDay, status });
      const nextStreak = status === "yes" ? calculateHabitStreak(habit, selectedDay, status) : 0;
      pulse(status === "yes" && nextStreak >= 3 ? [12, 32, 18] : status === "no" ? 18 : 8);
    },
    [eraseHabitLog, recordHabit, selectedDay],
  );

  const selectedDayLabel = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="fixed inset-0 z-30 h-dvh overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(129,140,248,0.14),transparent_26%),#060912] text-zinc-50 lg:relative lg:inset-auto lg:z-auto lg:h-[calc(100dvh-5rem)] lg:rounded-[28px]">
      <div className="mx-auto grid h-full max-h-full max-w-7xl gap-4 px-3 pb-0 pt-[calc(env(safe-area-inset-top,0px)+0.65rem)] sm:px-5 sm:pb-0 sm:pt-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:p-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section
          className={
            "relative flex h-full min-h-0 touch-pan-y flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/74 shadow-[0_28px_90px_rgba(2,6,23,0.36)] backdrop-blur-2xl transition-[transform] " +
            (swipeDragging ? "duration-0" : "duration-200 ease-out")
          }
          style={{ transform: `translate3d(${swipeOffset}px, 0, 0)` }}
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
          onTouchCancel={resetSwipe}
          onClickCapture={handleSwipeClickCapture}
        >
          <SwipeHint direction={swipeOffset < 0 ? 1 : swipeOffset > 0 ? -1 : 0} ready={swipeReady} viewMode={viewMode} />
          <header className="z-30 shrink-0 border-b border-white/10 bg-slate-950/84 px-3 py-3 backdrop-blur-2xl sm:px-4">
            <div className="grid grid-cols-[2.6rem_minmax(0,1fr)_2.6rem] items-center gap-2">
              <button
                type="button"
                aria-label="Open Jarvis navigation"
                onClick={openMobileMenu}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/10 active:scale-95"
              >
                <MenuIcon />
              </button>
              <div className="min-w-0 text-center">
                <button
                  type="button"
                  onClick={() => selectDay(todayKey)}
                  className="max-w-full truncate text-[17px] font-semibold leading-tight text-zinc-50 transition hover:text-cyan-100"
                >
                  {selectedDayLabel}
                </button>
                <div className="mx-auto mt-2 max-w-64">
                  <ProgressRail stats={dayStats} />
                </div>
              </div>
              <button
                type="button"
                aria-label="Add habit"
                onClick={openCreate}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-300 text-slate-950 shadow-[0_14px_30px_rgba(34,211,238,0.22)] transition hover:bg-cyan-200 active:scale-95"
              >
                <PlusIcon />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <SegmentedControl value={viewMode} onChange={setViewMode} />
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                aria-label="Previous day"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:text-white active:scale-95"
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => shiftDay(1)}
                aria-label="Next day"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:text-white active:scale-95"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <DayStrip days={visibleDays} viewMode={viewMode} onSelectDay={selectDay} />
          </header>

          <div className="shrink-0 border-b border-white/10 bg-slate-950/58 px-3 py-3 sm:px-4">
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => {
                const active = category === categoryFilter;
                const count = category === "All" ? orderedHabits.length : orderedHabits.filter((habit) => habit.category === category).length;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(category);
                      pulse(8);
                    }}
                    className={
                      "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition active:scale-[0.98] " +
                      (active
                        ? "border-cyan-200/50 bg-cyan-300/14 text-cyan-100"
                        : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-100")
                    }
                  >
                    <span>{category}</span>
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-zinc-400">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 lg:py-4">
            {!hydrated && <HabitSkeleton />}

            {hydrated && visibleHabits.length === 0 && (
              <EmptyState onAdd={openCreate} onStarters={addStarters} />
            )}

            {hydrated && visibleHabits.length > 0 && (
              <div className="space-y-3 pb-3 lg:pb-4">
                {visibleHabits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    days={visibleDays}
                    selectedDay={selectedDay}
                    selected={habit.id === selectedHabit?.id}
                    viewMode={viewMode}
                    onSelectHabit={() => {
                      setSelectedHabitId(habit.id);
                      pulse(8);
                    }}
                    onSelectDay={selectDay}
                    onApplyStatus={(status) => applyStatus(habit, status)}
                  />
                ))}
              </div>
            )}
          </main>

          <footer data-no-pull-refresh="true" data-no-swipe="true" className="shrink-0 border-t border-white/10 bg-slate-950/86 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.55rem)] pt-2 shadow-[0_-18px_45px_rgba(2,6,23,0.36)] backdrop-blur-2xl lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
              <ToolbarButton label="Home" href="/v2" icon={<HomeIcon />} />
              <ToolbarButton label="Today" onClick={() => selectDay(todayKey)} icon={<CalendarIcon />} />
              <ToolbarButton label="Prev" onClick={() => shiftDay(-1)} icon={<ChevronLeftIcon />} />
              <ToolbarButton label="Next" onClick={() => shiftDay(1)} icon={<ChevronRightIcon />} />
              <ToolbarButton label="Edit" onClick={openEdit} disabled={!selectedHabit} icon={<EditIcon />} />
            </div>
          </footer>
        </section>

        <aside className="hidden min-h-0 flex-col gap-4 lg:flex">
          <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.22)] backdrop-blur-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-200/70">Habits</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Chains</h1>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-300 text-slate-950 shadow-[0_12px_26px_rgba(34,211,238,0.22)] transition active:scale-95"
                aria-label="Add habit"
              >
                <PlusIcon />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <MetricBox label="Done" value={dayStats.yes.toString()} tone="green" />
              <MetricBox label="Missed" value={dayStats.no.toString()} tone="red" />
              <MetricBox label="Best" value={strongestChain.toString()} tone="cyan" />
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.22)] backdrop-blur-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Active</p>
                <h2 className="mt-2 truncate text-lg font-semibold text-white">
                  {selectedHabit ? formatHabitTitle(selectedHabit.title) : "No habit"}
                </h2>
              </div>
              <button
                type="button"
                onClick={openEdit}
                disabled={!selectedHabit}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:text-white disabled:opacity-40"
                aria-label="Edit selected habit"
              >
                <EditIcon />
              </button>
            </div>
            {selectedHabit && (
              <div className="mt-4 grid grid-cols-[3rem_minmax(0,1fr)] gap-3 rounded-[22px] border border-white/10 bg-black/20 p-3">
                <HabitGlyph icons={selectedHabit.icons} intent={selectedHabit.intent} large />
                <div className="min-w-0 text-sm text-zinc-300">
                  <p className="font-semibold text-zinc-100">{selectedHabit.intent === "quit" ? "Quit chain" : "Build chain"}</p>
                  <p className="mt-1 truncate text-zinc-500">{selectedHabit.category ?? "Unsorted"}</p>
                  <p className="mt-2 text-cyan-100">{selectedHabitStreak >= 3 ? `${selectedHabitStreak} day chain` : `${selectedHabitStreak} day streak`}</p>
                </div>
              </div>
            )}
          </section>

          <section className="min-h-0 flex-1 rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.22)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Day</p>
                <h2 className="mt-1 text-base font-semibold text-white">{selectedDayLabel}</h2>
              </div>
              <p className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-100">
                {completedToday}/{Math.max(orderedHabits.length, 1)} today
              </p>
            </div>
            <div className="mt-4 max-h-[52dvh] space-y-2 overflow-y-auto pr-1">
              {visibleHabits.map((habit) => (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => setSelectedHabitId(habit.id)}
                  className={
                    "grid w-full grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition " +
                    (habit.id === selectedHabit?.id
                      ? "border-cyan-200/40 bg-cyan-300/10"
                      : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/8")
                  }
                >
                  <HabitGlyph icons={habit.icons} intent={habit.intent} />
                  <span className="truncate text-sm font-semibold text-zinc-100">{formatHabitTitle(habit.title)}</span>
                  <span className={getDesktopStatusClass(habit.logs[selectedDay])}>{statusLabel(habit.logs[selectedDay])}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {editorMode && (
        <HabitEditor
          mode={editorMode}
          draft={draft}
          setDraft={setDraft}
          onClose={closeEditor}
          onSubmit={submitHabit}
          onDelete={editorMode === "edit" ? deleteSelectedHabit : undefined}
        />
      )}
    </div>
  );
}

function HabitRow({
  habit,
  days,
  selectedDay,
  selected,
  viewMode,
  onSelectHabit,
  onSelectDay,
  onApplyStatus,
}: {
  habit: HabitEntry;
  days: HabitDay[];
  selectedDay: DayKey;
  selected: boolean;
  viewMode: ViewMode;
  onSelectHabit: () => void;
  onSelectDay: (day: DayKey) => void;
  onApplyStatus: (status: HabitLogStatus | "erase") => void;
}) {
  const streak = calculateHabitStreak(habit, selectedDay);
  const selectedStatus = habit.logs[selectedDay];
  return (
    <article
      className={
        "rounded-[24px] border p-3 transition duration-200 " +
        (selected
          ? "border-cyan-200/45 bg-cyan-300/[0.075] shadow-[0_18px_42px_rgba(8,145,178,0.16)]"
          : "border-white/10 bg-white/[0.045] hover:border-white/18 hover:bg-white/[0.06]")
      }
      onClick={onSelectHabit}
    >
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3">
        <HabitGlyph icons={habit.icons} intent={habit.intent} />
        <button type="button" className="min-w-0 text-left" onClick={onSelectHabit}>
          <h2 className="truncate text-[15px] font-semibold leading-tight text-zinc-50 sm:text-base">
            {formatHabitTitle(habit.title)}
          </h2>
          <p className="mt-1 truncate text-[11px] text-zinc-500">
            {habit.category ?? "Unsorted"} · {habit.intent === "quit" ? "quit" : "build"} · {streak >= 3 ? `${streak} chain` : `${streak} streak`}
          </p>
        </button>
        <span className={getStatusPillClass(selectedStatus)}>{statusLabel(selectedStatus)}</span>
      </div>

      <div
        className="mt-3 grid overflow-hidden rounded-[16px] border border-white/10 bg-black/20"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const status = habit.logs[day.key];
          const chained = status === "yes" && calculateHabitStreak(habit, day.key) >= 3;
          const selectedCell = day.key === selectedDay;
          return (
            <button
              key={habit.id + day.key}
              type="button"
              aria-label={`${formatHabitTitle(habit.title)} ${day.key} ${statusLabel(status)}`}
              onClick={(event) => {
                event.stopPropagation();
                onSelectHabit();
                onSelectDay(day.key);
              }}
              className={getHabitCellClass({ status, selected: selectedCell, chained, compact: viewMode === "month" })}
              style={status === "skip" ? skipBackgroundStyle : undefined}
            >
              <span className="sr-only">{statusLabel(status)}</span>
            </button>
          );
        })}
      </div>

      {selected && <InlineActionBar currentStatus={selectedStatus} onApply={onApplyStatus} />}
    </article>
  );
}

function InlineActionBar({
  currentStatus,
  onApply,
}: {
  currentStatus?: HabitLogStatus;
  onApply: (status: HabitLogStatus | "erase") => void;
}) {
  return (
    <div data-no-swipe="true" className="mt-3 grid grid-cols-4 gap-2 rounded-[20px] border border-white/10 bg-slate-950/62 p-2 shadow-inner">
      <ActionButton label="Erase" icon={<EraseIcon />} active={false} onClick={() => onApply("erase")} tone="neutral" disabled={!isRecordedStatus(currentStatus)} />
      <ActionButton label="Yes" icon={<CheckIcon />} active={currentStatus === "yes"} onClick={() => onApply("yes")} tone="yes" />
      <ActionButton label="No" icon={<XIcon />} active={currentStatus === "no"} onClick={() => onApply("no")} tone="no" />
      <ActionButton label="Skip" icon={<SkipIcon />} active={currentStatus === "skip"} onClick={() => onApply("skip")} tone="neutral" />
    </div>
  );
}

function ActionButton({
  label,
  icon,
  active,
  onClick,
  tone,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  tone: "yes" | "no" | "neutral";
  disabled?: boolean;
}) {
  const toneClass =
    tone === "yes"
      ? active
        ? "border-emerald-200/60 bg-emerald-300 text-slate-950"
        : "border-emerald-200/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/16"
      : tone === "no"
        ? active
          ? "border-rose-200/60 bg-rose-400 text-white"
          : "border-rose-200/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/16"
        : active
          ? "border-cyan-200/40 bg-cyan-300/16 text-cyan-100"
          : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/8";
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-w-0 flex-col items-center gap-1 rounded-[16px] border px-2 py-2 text-[11px] font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 ${toneClass}`}
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function HabitEditor({
  mode,
  draft,
  setDraft,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: Exclude<EditorMode, null>;
  draft: HabitDraft;
  setDraft: (updater: (current: HabitDraft) => HabitDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/74 p-0 backdrop-blur-md sm:items-center sm:justify-center sm:p-6">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-t-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.15rem)] text-white shadow-[0_-24px_80px_rgba(2,6,23,0.45)] sm:max-w-lg sm:rounded-[30px] sm:pb-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">{mode === "edit" ? "Edit" : "New"}</p>
            <h2 className="mt-1 text-2xl font-semibold">Habit</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:text-white active:scale-95"
            aria-label="Close habit editor"
          >
            <XIcon />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-zinc-300">
            Name
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-200/60 focus:bg-black/40"
              placeholder="Deep focus"
              autoFocus
            />
          </label>

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-zinc-300" htmlFor="habit-icons">Icon</label>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
              <div className="flex h-full min-h-16 items-center justify-center rounded-[22px] border border-cyan-200/20 bg-cyan-300/10 text-3xl">
                {draft.icons.trim() || "✓"}
              </div>
              <input
                id="habit-icons"
                value={draft.icons}
                onChange={(event) => setDraft((current) => ({ ...current, icons: event.target.value }))}
                className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-200/60 focus:bg-black/40"
                maxLength={16}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {iconPresets.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, icons: icon }))}
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg transition active:scale-95 " +
                    (draft.icons === icon
                      ? "border-cyan-200/60 bg-cyan-300/18"
                      : "border-white/10 bg-white/5 hover:bg-white/8")
                  }
                  aria-label={`Use ${icon} icon`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-zinc-300">
            Group
            <input
              value={draft.category}
              onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
              className="rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-200/60 focus:bg-black/40"
              placeholder="Private"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-white/10 bg-black/30 p-1">
            {(["build", "quit"] as const).map((intent) => (
              <button
                key={intent}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, intent }))}
                className={
                  "rounded-[16px] px-4 py-3 text-sm font-semibold capitalize transition active:scale-[0.98] " +
                  (draft.intent === intent ? "bg-cyan-300 text-slate-950 shadow-sm" : "text-zinc-400 hover:text-zinc-100")
                }
              >
                {intent}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto] gap-3">
          <button type="submit" className="rounded-[18px] bg-cyan-300 px-5 py-3.5 text-base font-semibold text-slate-950 shadow-[0_16px_34px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200 active:scale-[0.98]">
            {mode === "edit" ? "Save" : "Add"}
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} className="rounded-[18px] border border-rose-200/20 bg-rose-500/12 px-5 py-3.5 text-base font-semibold text-rose-100 transition hover:bg-rose-500/18 active:scale-[0.98]">
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function DayStrip({ days, viewMode, onSelectDay }: { days: HabitDay[]; viewMode: ViewMode; onSelectDay: (day: DayKey) => void }) {
  return (
    <div
      className={"mt-3 grid gap-1 " + (viewMode === "month" ? "overflow-hidden" : "")}
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map((day) => (
        <button
          key={day.key}
          type="button"
          onClick={() => onSelectDay(day.key)}
          className={
            "min-w-0 rounded-[14px] text-center transition active:scale-[0.97] " +
            (viewMode === "month" ? "px-0.5 py-1.5 " : "px-1 py-2 ") +
            (day.isSelected
              ? "bg-cyan-300 text-slate-950 shadow-[0_10px_24px_rgba(34,211,238,0.18)]"
              : day.isToday
                ? "bg-cyan-300/10 text-cyan-100"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200")
          }
        >
          <span className={"block truncate font-semibold leading-none " + (viewMode === "month" ? "text-[10px]" : "text-[11px] sm:text-xs")}>
            {viewMode === "week" ? day.label : day.dayNumber}
          </span>
          {viewMode === "week" && <span className="mt-1 block text-xs font-semibold opacity-70">{day.dayNumber}</span>}
        </button>
      ))}
    </div>
  );
}

function SegmentedControl({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="grid w-36 grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold text-zinc-400">
      {(["week", "month"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => {
            onChange(mode);
            pulse(8);
          }}
          className={
            "rounded-full px-3 py-2 capitalize transition " +
            (value === mode ? "bg-white text-slate-950 shadow-sm" : "hover:text-zinc-100")
          }
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ onAdd, onStarters }: { onAdd: () => void; onStarters: () => void }) {
  return (
    <div className="grid min-h-[48dvh] place-items-center px-3 py-10">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_24px_80px_rgba(2,6,23,0.25)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cyan-300/12 text-cyan-100">
          <CheckIcon />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-white">Start a chain</h2>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onStarters} className="rounded-[18px] border border-emerald-200/20 bg-emerald-300/12 px-4 py-3 text-sm font-semibold text-emerald-100 transition active:scale-[0.98]">
            Starters
          </button>
          <button type="button" onClick={onAdd} className="rounded-[18px] bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition active:scale-[0.98]">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function SwipeHint({ direction, ready, viewMode }: { direction: -1 | 0 | 1; ready: boolean; viewMode: ViewMode }) {
  if (direction === 0) return null;
  const period = viewMode === "month" ? "month" : "week";
  const target = direction > 0 ? `next ${period}` : `previous ${period}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center px-4">
      <div
        className={
          "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] shadow-[0_16px_40px_rgba(2,6,23,0.34)] backdrop-blur-2xl transition " +
          (ready
            ? "border-cyan-200/60 bg-cyan-300 text-slate-950"
            : "border-white/10 bg-slate-950/82 text-cyan-100")
        }
      >
        {ready ? `Release for ${target}` : `Swipe for ${target}`}
      </div>
    </div>
  );
}

function ProgressRail({ stats }: { stats: ReturnType<typeof buildDayStats> }) {
  const total = Math.max(stats.total, 1);
  const yes = (stats.yes / total) * 100;
  const no = (stats.no / total) * 100;
  const skip = (stats.skip / total) * 100;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
      <span className="bg-emerald-300" style={{ width: `${yes}%` }} />
      <span className="bg-rose-400" style={{ width: `${no}%` }} />
      <span className="bg-zinc-500" style={{ width: `${skip}%` }} />
    </div>
  );
}

function HabitGlyph({ icons, intent, large = false }: { icons: string; intent: HabitIntent; large?: boolean }) {
  return (
    <span
      className={
        "flex shrink-0 items-center justify-center rounded-[18px] border text-center shadow-inner " +
        (large ? "h-12 w-12 text-2xl" : "h-11 w-11 text-xl") +
        " " +
        (intent === "quit"
          ? "border-rose-200/20 bg-rose-400/12 text-rose-100"
          : "border-cyan-200/20 bg-cyan-300/12 text-cyan-100")
      }
    >
      <span className="max-w-full truncate px-1">{icons || "✓"}</span>
    </span>
  );
}

function MetricBox({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "cyan" }) {
  const toneClass = tone === "green" ? "text-emerald-200" : tone === "red" ? "text-rose-200" : "text-cyan-100";
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function HabitSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-[24px] border border-white/10 bg-white/[0.045] p-3">
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_4rem] items-center gap-3">
            <div className="h-11 w-11 rounded-[18px] bg-white/10" />
            <div>
              <div className="h-4 w-3/4 rounded bg-white/10" />
              <div className="mt-2 h-3 w-1/2 rounded bg-white/8" />
            </div>
            <div className="h-6 rounded-full bg-white/8" />
          </div>
          <div className="mt-3 grid grid-cols-7 overflow-hidden rounded-[16px] border border-white/10">
            {Array.from({ length: 7 }).map((__, cell) => (
              <div key={cell} className="h-10 border-r border-black/30 bg-white/8" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolbarButton({
  label,
  icon,
  href,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const className = "flex min-w-0 flex-col items-center gap-1 rounded-[18px] px-2 py-2 text-[11px] font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 active:scale-[0.97] disabled:opacity-40";
  const content = (
    <>
      <span className="flex h-5 w-5 items-center justify-center text-cyan-100">{icon}</span>
      <span className="truncate">{label}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} aria-label={label}>
      {content}
    </button>
  );
}

const skipBackgroundStyle = {
  backgroundImage: "repeating-linear-gradient(135deg, rgba(148,163,184,0.08) 0 8px, rgba(148,163,184,0.28) 8px 12px)",
};

function getHabitCellClass({
  status,
  selected,
  chained,
  compact,
}: {
  status?: HabitLogStatus;
  selected: boolean;
  chained: boolean;
  compact: boolean;
}) {
  const tone = status === "yes" ? "bg-emerald-400" : status === "no" ? "bg-rose-500" : "bg-white/[0.075]";
  return [
    compact ? "h-8 sm:h-9" : "h-9 sm:h-10",
    "min-w-0 border-r border-slate-950/45 transition focus:outline-none focus:ring-2 focus:ring-cyan-200 active:scale-[0.99]",
    tone,
    selected ? "ring-2 ring-inset ring-cyan-100" : "",
    chained ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16),0_0_18px_rgba(52,211,153,0.15)]" : "",
  ].join(" ");
}

function getStatusPillClass(status?: HabitLogStatus) {
  const base = "rounded-full px-2.5 py-1 text-[11px] font-semibold";
  if (status === "yes") return `${base} bg-emerald-300/14 text-emerald-100`;
  if (status === "no") return `${base} bg-rose-400/14 text-rose-100`;
  if (status === "skip") return `${base} bg-zinc-400/12 text-zinc-300`;
  return `${base} bg-white/7 text-zinc-500`;
}

function getDesktopStatusClass(status?: HabitLogStatus) {
  if (status === "yes") return "rounded-full bg-emerald-300/14 px-2.5 py-1 text-center text-xs font-semibold text-emerald-100";
  if (status === "no") return "rounded-full bg-rose-400/14 px-2.5 py-1 text-center text-xs font-semibold text-rose-100";
  if (status === "skip") return "rounded-full bg-zinc-400/12 px-2.5 py-1 text-center text-xs font-semibold text-zinc-300";
  return "rounded-full bg-white/7 px-2.5 py-1 text-center text-xs font-semibold text-zinc-500";
}

function buildDayStats(habits: HabitEntry[], day: DayKey) {
  return habits.reduce(
    (acc, habit) => {
      const status = habit.logs[day];
      if (status === "yes") acc.yes += 1;
      if (status === "no") acc.no += 1;
      if (status === "skip") acc.skip += 1;
      if (isRecordedStatus(status)) acc.logged += 1;
      return acc;
    },
    { total: habits.length, logged: 0, yes: 0, no: 0, skip: 0 },
  );
}

function buildWeekDays(day: DayKey, todayKey: DayKey): HabitDay[] {
  const selected = dayKeyToDate(day);
  const start = new Date(selected);
  start.setDate(selected.getDate() - selected.getDay());
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = getDayKey(date);
    return {
      key,
      date,
      label: weekLabels[date.getDay()],
      shortLabel: chainLabels[date.getDay()],
      dayNumber: String(date.getDate()),
      isToday: key === todayKey,
      isSelected: key === day,
    };
  });
}

function buildMonthDays(day: DayKey, todayKey: DayKey): HabitDay[] {
  const selected = dayKeyToDate(day);
  const start = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  return Array.from({ length: end.getDate() }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = getDayKey(date);
    return {
      key,
      date,
      label: weekLabels[date.getDay()],
      shortLabel: chainLabels[date.getDay()],
      dayNumber: String(date.getDate()),
      isToday: key === todayKey,
      isSelected: key === day,
    };
  });
}

function calculateHabitStreak(habit: HabitEntry, day: DayKey, overrideStatus?: HabitLogStatus) {
  let streak = 0;
  const cursor = dayKeyToDate(day);
  for (let index = 0; index < 730; index += 1) {
    const key = getDayKey(cursor);
    const status = key === day && overrideStatus ? overrideStatus : habit.logs[key];
    if (status === "yes") {
      streak += 1;
    } else if (status !== "skip") {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function shiftDayKey(day: DayKey, amount: number): DayKey {
  const date = dayKeyToDate(day);
  date.setDate(date.getDate() + amount);
  return getDayKey(date);
}

function shiftMonthKey(day: DayKey, amount: number): DayKey {
  const date = dayKeyToDate(day);
  const targetMonth = date.getMonth() + amount;
  const targetYear = date.getFullYear();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return getDayKey(new Date(targetYear, targetMonth, Math.min(date.getDate(), lastDay)));
}

function formatHabitTitle(title: string) {
  return title.trim() || "Habit";
}

function statusLabel(status?: HabitLogStatus) {
  if (status === "yes") return "Yes";
  if (status === "no") return "No";
  if (status === "skip") return "Skip";
  return "Empty";
}

function isRecordedStatus(status?: HabitLogStatus) {
  return status === "yes" || status === "no" || status === "skip";
}

function pulse(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  const haptics = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  haptics.vibrate?.(pattern);
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
      <rect x="3" y="4" width="18" height="18" rx="4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function EraseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 14 7-7a3 3 0 0 1 4 0l7 7-5 5H8Z" />
      <path d="m11 11 4 4" />
      <path d="m15 11-4 4" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 6v12l8-6Z" />
      <path d="M19 6v12" />
    </svg>
  );
}
