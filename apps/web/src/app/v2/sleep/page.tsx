"use client";

import { useSearchParams } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Day,
  JarvisState,
  SleepEntry,
  SleepPresetMode,
  SleepSchedule,
  SleepWindow,
  dayKeyToDate,
  getDayKey,
  getDayOfWeek,
  useJarvisState,
} from "@/lib/jarvisStore";
import { useToast } from "@/components/Toast";
import { formatMinutesLabel, minutesToTimeString, parseTimeToMinutes } from "@/lib/timeDisplay";

const TOTAL_MINUTES = 24 * 60;
const DIAL_MINUTES = 12 * 60;
const DEFAULT_DURATION = 8 * 60;
const CLOCK_SIZE = 340;
const CLOCK_RADIUS = 130;
const allDays: Day[] = [0, 1, 2, 3, 4, 5, 6];
const modeOptions: { label: string; value: SleepPresetMode }[] = [
  { label: "Last night", value: "daily" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Weekends", value: "weekends" },
  { label: "Custom", value: "custom" },
];
const dayLabels: Record<Day, { short: string; long: string }> = {
  0: { short: "Sun", long: "Sunday" },
  1: { short: "Mon", long: "Monday" },
  2: { short: "Tue", long: "Tuesday" },
  3: { short: "Wed", long: "Wednesday" },
  4: { short: "Thu", long: "Thursday" },
  5: { short: "Fri", long: "Friday" },
  6: { short: "Sat", long: "Saturday" },
};

export default function SleepPage() {
  const showScheduleControls = false;
  const { state, hydrated, logSleep, updateSleepSchedule, updateSleepEntry, deleteSleepEntry } =
    useJarvisState();
  const { showToast } = useToast();
  const search = useSearchParams();
  const todayDay = getDayOfWeek();
  const schedule = state.sleepSchedule;
  const lastNightDay = ((todayDay + 6) % 7) as Day;
  const defaultFocus = schedule.lastEditedDay ?? (schedule.mode === "daily" ? lastNightDay : todayDay);
  const [focusedDay, setFocusedDay] = useState<Day>(defaultFocus);
  const [customDays, setCustomDays] = useState<Day[]>(() =>
    schedule.mode === "custom" ? [defaultFocus] : [defaultFocus],
  );
  const [startMinutes, setStartMinutes] = useState(() => {
    const window = getWindowForDay(schedule, defaultFocus);
    return parseTimeToMinutes(window.lightsOut) ?? 23 * 60;
  });
  const [endMinutes, setEndMinutes] = useState(() => {
    const window = getWindowForDay(schedule, defaultFocus);
    return parseTimeToMinutes(window.wake) ?? 7 * 60;
  });
  const [quality, setQuality] = useState(4);
  const [recovery, setRecovery] = useState(3);
  const [dreams, setDreams] = useState("");
  const [notes, setNotes] = useState("");
  const [editingNight, setEditingNight] = useState<SleepEntry | null>(null);
  const [calendarDay, setCalendarDay] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return getDayKey(date);
  });
  const [manualLogDayKey, setManualLogDayKey] = useState<string | null>(null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const focusNightId = search?.get("focus");
  const focusQueryDay = search?.get("day");
  const focusNightRef = useRef<HTMLDivElement | null>(null);

  const editingDays = useMemo(() => {
    switch (schedule.mode) {
      case "daily":
        return [lastNightDay];
      case "weekdays":
        return [1, 2, 3, 4, 5];
      case "weekends":
        return [0, 6];
      case "custom":
      default:
        return customDays.length ? customDays : [focusedDay];
    }
  }, [schedule.mode, customDays, focusedDay, lastNightDay]);

  useEffect(() => {
    if (editingNight) return;
    const window = getWindowForDay(schedule, focusedDay);
    const start = parseTimeToMinutes(window.lightsOut);
    const wake = parseTimeToMinutes(window.wake);
    if (start !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStartMinutes(start);
    }
    if (wake !== null) {
      setEndMinutes(wake);
    }
  }, [schedule, focusedDay, editingNight]);

  const editingSummary = useMemo(() => formatEditingSummary(schedule.mode, editingDays), [
    schedule.mode,
    editingDays,
  ]);

  const durationMins = useMemo(
    () => calculateDuration(startMinutes, endMinutes),
    [startMinutes, endMinutes],
  );
  const durationLabel = useMemo(() => formatDuration(durationMins), [durationMins]);


  const recentNights = useMemo(() => getRecentSleep(state, 7), [state]);
  const averageHours = useMemo(() => computeAverageHours(recentNights), [recentNights]);
  const averageQuality = useMemo(() => computeAverageQuality(recentNights), [recentNights]);
  const averageRecovery = useMemo(() => computeAverageRecovery(recentNights), [recentNights]);
  const editingNightId = editingNight?.id ?? null;
  const isEditing = Boolean(editingNight);
  const editingDayLabel = editingNight
    ? dayKeyToDate(editingNight.day).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : dayLabels[focusedDay].long;
  const manualLogLabel = useMemo(() => {
    if (!manualLogDayKey) return null;
    return dayKeyToDate(manualLogDayKey).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }, [manualLogDayKey]);
  const manualLogDayLabel = useMemo(() => {
    if (!manualLogDayKey) return null;
    return dayKeyToDate(manualLogDayKey).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [manualLogDayKey]);
  const loggingLabel = manualLogDayLabel ?? dayLabels[focusedDay].long;
  const headerStatusLabel = isEditing ? `Editing ${editingDayLabel}` : `Logging ${loggingLabel}`;

  useEffect(() => {
    if (!focusQueryDay) return;
    const parsed = new Date(focusQueryDay);
    if (Number.isNaN(parsed.getTime())) return;
    const day = parsed.getDay() as Day;
    if (day === focusedDay && schedule.lastEditedDay === day) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFocusedDay(day);
    if (schedule.mode === "custom") {
      setCustomDays([day]);
    }
    updateSleepSchedule({ ...schedule, lastEditedDay: day });
  }, [focusQueryDay, focusedDay, schedule, updateSleepSchedule]);

  useEffect(() => {
    if (schedule.mode === "custom" && !customDays.includes(focusedDay)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomDays((current) => (current.includes(focusedDay) ? current : [focusedDay]));
    }
  }, [schedule.mode, customDays, focusedDay]);

  useEffect(() => {
    if (!focusNightId || !focusNightRef.current) return;
    focusNightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusNightId, recentNights.length]);

  useEffect(() => {
    if (manualLogDayKey) return;
    if (
      schedule.lastEditedDay !== undefined &&
      schedule.lastEditedDay !== focusedDay &&
      !focusQueryDay
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedDay(schedule.lastEditedDay);
    }
  }, [schedule.lastEditedDay, focusedDay, focusQueryDay, manualLogDayKey]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const handleClockChange = useCallback(
    (range: { startMinutes: number; endMinutes: number }) => {
      const snappedStart = snapToFive(range.startMinutes);
      const snappedEnd = snapToFive(range.endMinutes);
      setStartMinutes(snappedStart);
      setEndMinutes(snappedEnd);
      if (!editingNight) {
        const nextWindow: SleepWindow = {
          lightsOut: minutesToTimeString(snappedStart),
          wake: minutesToTimeString(snappedEnd),
        };
        const nextSchedule = applyWindowToSchedule(schedule, editingDays, nextWindow);
        updateSleepSchedule({ ...nextSchedule, lastEditedDay: focusedDay });
      }
    },
    [schedule, editingDays, focusedDay, updateSleepSchedule, editingNight],
  );

  const handleModeChange = useCallback(
    (mode: SleepPresetMode) => {
      if (mode === schedule.mode) return;
      const nextFocus = resolveFocusForMode(mode, focusedDay, lastNightDay);
      if (mode === "custom" && !customDays.includes(nextFocus)) {
        setCustomDays([nextFocus]);
      }
      if (mode !== "custom") {
        setCustomDays([nextFocus]);
      }
      setFocusedDay(nextFocus);
      updateSleepSchedule({ ...schedule, mode, lastEditedDay: nextFocus });
    },
    [schedule, focusedDay, customDays, lastNightDay, updateSleepSchedule],
  );

  const handleCustomDayToggle = useCallback(
    (day: Day) => {
      if (schedule.mode !== "custom") return;
      const wasActive = customDays.includes(day);
      let next = wasActive ? customDays.filter((value) => value !== day) : [...customDays, day];
      if (next.length === 0) {
        next = [day];
      }
      let nextFocus = focusedDay;
      if (wasActive) {
        if (!next.includes(nextFocus)) {
          nextFocus = next[0];
        }
      } else {
        nextFocus = day;
      }
      setCustomDays(next);
      setFocusedDay(nextFocus);
      updateSleepSchedule({ ...schedule, lastEditedDay: nextFocus });
    },
    [schedule, customDays, focusedDay, updateSleepSchedule],
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const trimmedDreams = dreams.trim();
      const trimmedNotes = notes.trim();
      const payload = {
        durationMins: durationMins || DEFAULT_DURATION,
        quality,
        startMinutes,
        endMinutes,
        recoveryScore: recovery,
        dreams: trimmedDreams || undefined,
        notes: trimmedNotes || undefined,
      };
      if (editingNight) {
        updateSleepEntry({
          day: editingNight.day,
          id: editingNight.id,
          updates: payload,
        });
        setEditingNight(null);
        setDreams("");
        setNotes("");
        showToast("Sleep updated");
        return;
      }
      const dayKey = manualLogDayKey ?? getRecentDayKeyForWeekday(focusedDay);
      logSleep({
        day: dayKey,
        ...payload,
      });
      setDreams("");
      setNotes("");
      if (manualLogDayKey) {
        setManualLogDayKey(null);
      }
      showToast(`Sleep logged for ${manualLogDayLabel ?? dayLabels[focusedDay].long}`);
    },
    [
      focusedDay,
      durationMins,
      quality,
      recovery,
      startMinutes,
      endMinutes,
      dreams,
      notes,
      logSleep,
      editingNight,
      updateSleepEntry,
      manualLogDayKey,
      showToast,
    ],
  );

  const handleFormKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (event.key !== "Enter") return;
      const targetTag = (event.target as HTMLElement).tagName;
      const isTextarea = targetTag === "TEXTAREA";
      if (isTextarea && !(event.metaKey || event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      handleSubmit();
    },
    [handleSubmit],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingNight(null);
    setDreams("");
    setNotes("");
  }, []);

  const handleEditNight = useCallback(
    (night: SleepEntry) => {
      const start = resolveStartFromEntry(night, startMinutes);
      const end = resolveEndFromEntry(night, start);
      const date = dayKeyToDate(night.day);
      setFocusedDay(date.getDay() as Day);
      setStartMinutes(start);
      setEndMinutes(end);
      setQuality(night.quality);
      setRecovery(night.recoveryScore ?? 3);
      setDreams(night.dreams ?? "");
      setNotes(night.notes ?? "");
      setEditingNight(night);
    },
    [startMinutes],
  );

  const handleDeleteNight = useCallback(
    (night: SleepEntry) => {
      const confirmed = window.confirm("Delete this sleep entry?");
      if (!confirmed) return;
      deleteSleepEntry({ day: night.day, id: night.id });
      if (editingNight?.id === night.id) {
        handleCancelEdit();
      }
      showToast("Sleep deleted");
    },
    [deleteSleepEntry, editingNight, handleCancelEdit, showToast],
  );

  const handleCalendarJump = useCallback(
    (targetDay?: string) => {
      const resolvedDay = targetDay ?? calendarDay;
      if (!resolvedDay) return;
      const nightsForDay = state.sleep[resolvedDay] ?? [];
      if (nightsForDay.length) {
        const latest = [...nightsForDay].sort((a, b) => b.ts - a.ts)[0];
        handleEditNight(latest);
        setManualLogDayKey(null);
        showToast("Loaded sleep entry for that date");
        return;
      }
      const parsed = new Date(resolvedDay);
      if (Number.isNaN(parsed.getTime())) return;
      setManualLogDayKey(resolvedDay);
      setFocusedDay(parsed.getDay() as Day);
      setEditingNight(null);
      setDreams("");
      setNotes("");
      showToast("Ready to log this date");
    },
    [calendarDay, state.sleep, handleEditNight, showToast],
  );

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading sleep log…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Sleep</p>
      </header>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-lg sm:p-6">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Night editor</h2>
            <p className="text-sm text-zinc-400">Set the window and log the quality.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-zinc-300">
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/80 whitespace-nowrap">
              {durationLabel}
            </span>
            {manualLogLabel && (
              <span className="text-[11px] text-cyan-200">Logging {manualLogLabel}</span>
            )}
            {!manualLogLabel && (
              <span className="text-[11px] text-white/60">{headerStatusLabel}</span>
            )}
            <div className="flex items-center gap-2">
              <label className="relative cursor-pointer rounded-full border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-transparent p-2 text-white/80 shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:text-white">
                <span className="sr-only">Select day</span>
                <CalendarIcon className="h-4 w-4" />
                <input
                  ref={dateInputRef}
                  type="date"
                  value={calendarDay}
                  onChange={(event) => {
                    const nextDay = event.target.value;
                    setCalendarDay(nextDay);
                    handleCalendarJump(nextDay);
                  }}
                  max={getDayKey()}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <button
                type="button"
                onClick={() => handleCalendarJump()}
                className="rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/80 hover:text-white"
              >
                Load day
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-5 sm:gap-6 lg:grid-cols-2 lg:items-stretch">
          <div className="order-1 flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5 lg:h-full lg:min-h-[520px]">
            <SleepClock startMinutes={startMinutes} endMinutes={endMinutes} onChange={handleClockChange} />
          </div>

          <div className="order-2 flex flex-col gap-5">
            {showScheduleControls && (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">Schedule mode</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {modeOptions.map((option) => {
                    const active = schedule.mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleModeChange(option.value)}
                        className={`rounded-2xl border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] transition ${
                          active
                            ? "border-white bg-white text-zinc-900 shadow-md"
                            : "border-white/15 bg-white/5 text-white/70 hover:border-white/40"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {schedule.mode === "custom" ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {allDays.map((day) => {
                        const active = customDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleCustomDayToggle(day)}
                            className={`rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                              active ? "bg-cyan-300 text-zinc-900" : "bg-white/10 text-zinc-400"
                            }`}
                          >
                            {dayLabels[day].short}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                      {editingSummary}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                    {editingSummary}
                  </p>
                )}
              </div>
            )}

            <form
              className="flex min-w-0 flex-col gap-5 rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5 lg:h-full lg:min-h-[520px]"
              onSubmit={handleSubmit}
              onKeyDown={handleFormKeyDown}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-zinc-400">
                <p>{isEditing ? `Editing: ${editingDayLabel}` : `Logging: ${loggingLabel}`}</p>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold text-white/80 hover:text-white"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SliderField
                  label="Quality"
                  value={quality}
                  min={1}
                  max={5}
                  onChange={(value) => setQuality(value)}
                  suffix={`/5`}
                />
                <SliderField
                  label="Recovery"
                  value={recovery}
                  min={1}
                  max={5}
                  onChange={(value) => setRecovery(value)}
                  suffix={`/5`}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
                <textarea
                  value={dreams}
                  onChange={(event) => setDreams(event.target.value)}
                  rows={3}
                  placeholder="Dream notes, symbols, themes"
                  className="resize-y rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none lg:min-h-[240px] lg:h-full"
                />
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Recovery notes, habits, or HRV cues"
                  className="resize-y rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none lg:min-h-[240px] lg:h-full"
                />
              </div>
              <button
                type="submit"
                className="mt-auto rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
              >
                {isEditing ? "Save changes" : "Log sleep"}
              </button>
            </form>
          </div>
        </div>
      </section>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileDetailsOpen((current) => !current)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.3em] text-white/80"
          aria-expanded={mobileDetailsOpen}
        >
          {mobileDetailsOpen ? "Hide details" : "View details"}
        </button>
      </div>

      <section className={`grid gap-6 lg:grid-cols-3 ${mobileDetailsOpen ? "lg:grid" : "hidden lg:grid"}`}>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-medium text-white">Recent nights</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              Avg {averageHours.toFixed(1)}h • Quality {averageQuality.toFixed(1)}/5
            </p>
          </div>
          <div className="mt-4 space-y-4">
            {recentNights.length === 0 ? (
              <p className="text-sm text-zinc-400">No entries yet. Log last night above.</p>
            ) : (
              recentNights.map((night) => {
                const highlight = night.id === focusNightId || night.id === editingNightId;
                return (
                  <article
                    key={night.id}
                    ref={highlight ? focusNightRef : undefined}
                    className={`rounded-2xl border border-white/5 bg-black/30 p-4 ${highlight ? "ring-2 ring-cyan-300/70" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xl font-semibold text-white">
                          {formatDuration(night.durationMins)}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                          {dayKeyToDate(night.day).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditNight(night)}
                          className="rounded-full border border-cyan-300/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-200 hover:border-cyan-300"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNight(night)}
                          className="rounded-full bg-red-500/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white hover:bg-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-left text-xs text-zinc-400 sm:text-right">
                      <p>{formatWindowLabel(night)}</p>
                      <p>
                        Quality {night.quality}/5
                        {night.recoveryScore ? ` • Recovery ${night.recoveryScore}/5` : ""}
                      </p>
                    </div>
                    {(night.dreams || night.notes) && (
                      <div className="mt-3 space-y-2 text-sm text-zinc-300">
                        {night.dreams && <p className="break-words">Dreams: {night.dreams}</p>}
                        {night.notes && <p className="break-words">Recovery: {night.notes}</p>}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Rest metrics</h2>
          <div className="mt-6 space-y-5 text-sm text-zinc-300">
            <MetricLine label="Avg hours" value={`${averageHours.toFixed(1)}h`} trend="7-day" />
            <MetricLine label="Avg quality" value={`${averageQuality.toFixed(1)}/5`} trend="Self-report" />
            <MetricLine label="Avg recovery" value={`${averageRecovery.toFixed(1)}/5`} trend="Body score" />
          </div>
        </div>
      </section>
    </div>
  );
}

type SliderFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
};

function SliderField({ label, value, min, max, suffix = "", onChange }: SliderFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300">
      <span>
        {label}: <span className="text-cyan-300">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded bg-zinc-700 accent-cyan-300"
      />
    </label>
  );
}

type SleepClockProps = {
  startMinutes: number;
  endMinutes: number;
  onChange: (range: { startMinutes: number; endMinutes: number }) => void;
};

function SleepClock({ startMinutes, endMinutes, onChange }: SleepClockProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const scrollLockRef = useRef<number | null>(null);

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current !== null) return;
    const scrollY = window.scrollY;
    scrollLockRef.current = scrollY;
    document.body.classList.add("scroll-locked");
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }, []);

  const unlockScroll = useCallback(() => {
    if (scrollLockRef.current === null) return;
    const scrollY = scrollLockRef.current;
    scrollLockRef.current = null;
    document.body.classList.remove("scroll-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    window.scrollTo(0, scrollY);
  }, []);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!draggingRef.current) return;
      event.preventDefault();
      const dial = dialRef.current;
      if (!dial) return;
      const rect = dial.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const angle = Math.atan2(dy, dx);
      const degrees = ((angle * 180) / Math.PI + 450) % 360;
      const dialMinutes = snapToFive(Math.round((degrees / 360) * DIAL_MINUTES) % DIAL_MINUTES);
      if (draggingRef.current === "start") {
        onChange({
          startMinutes: dialMinutesToDayMinutes(dialMinutes, startMinutes),
          endMinutes,
        });
      } else {
        onChange({
          startMinutes,
          endMinutes: dialMinutesToDayMinutes(dialMinutes, endMinutes),
        });
      }
    }

    function handleUp() {
      draggingRef.current = null;
      setIsDragging(false);
      unlockScroll();
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [startMinutes, endMinutes, onChange]);

  useEffect(() => {
    if (!isDragging) return;
    return () => unlockScroll();
  }, [isDragging, unlockScroll]);

  const beginDrag = useCallback((handle: "start" | "end", event: ReactPointerEvent<HTMLButtonElement>) => {
    draggingRef.current = handle;
    lockScroll();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
  }, [lockScroll]);

  const dialStart = startMinutes % DIAL_MINUTES;
  const dialEnd = endMinutes % DIAL_MINUTES;
  const segments = buildArcSegments(dialStart, dialEnd);
  const durationMins = calculateDuration(startMinutes, endMinutes);
  const duration = formatDuration(durationMins);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        ref={dialRef}
        className="relative mx-auto aspect-square w-full max-w-[320px] select-none touch-none sm:max-w-[340px]"
        style={{ overscrollBehavior: "contain" }}
        onTouchMove={(event) => {
          if (isDragging) {
            event.preventDefault();
          }
        }}
      >
        <svg viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} className="h-full w-full">
          <circle
            cx={CLOCK_SIZE / 2}
            cy={CLOCK_SIZE / 2}
            r={CLOCK_RADIUS}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={34}
            fill="none"
          />
          <circle
            cx={CLOCK_SIZE / 2}
            cy={CLOCK_SIZE / 2}
            r={CLOCK_RADIUS - 38}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={10}
            fill="none"
          />
          {Array.from({ length: 60 }).map((_, index) => {
            const angle = (index * 6 - 90) * (Math.PI / 180);
            const outer = CLOCK_RADIUS - 4;
            const inner = outer - (index % 5 === 0 ? 16 : 8);
            const x1 = CLOCK_SIZE / 2 + outer * Math.cos(angle);
            const y1 = CLOCK_SIZE / 2 + outer * Math.sin(angle);
            const x2 = CLOCK_SIZE / 2 + inner * Math.cos(angle);
            const y2 = CLOCK_SIZE / 2 + inner * Math.sin(angle);
            return (
              <line
                key={`tick-${index}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={index % 5 === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
                strokeWidth={index % 5 === 0 ? 3 : 1}
              />
            );
          })}
          {Array.from({ length: 12 }).map((_, index) => {
            const angle = (index * 30 - 90) * (Math.PI / 180);
            const textRadius = CLOCK_RADIUS - 60;
            const x = CLOCK_SIZE / 2 + textRadius * Math.cos(angle);
            const y = CLOCK_SIZE / 2 + textRadius * Math.sin(angle) + 4;
            return (
              <text
                key={`hour-${index}`}
                x={x}
                y={y}
                className="fill-white text-[13px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                textAnchor="middle"
              >
                {index === 0 ? 12 : index}
              </text>
            );
          })}
          {segments.map((segment, index) => {
            const d = describeArc(segment.start, segment.end);
            return (
              <path
                key={`${segment.start}-${segment.end}-${index}`}
                d={d}
                stroke="url(#sleepGradient)"
                strokeWidth={36}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}
          <defs>
            <linearGradient id="sleepGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
        </svg>
        <ClockHandle
          label="Sleep"
          minutes={startMinutes}
          onPointerDown={(event) => beginDrag("start", event)}
        />
        <ClockHandle
          label="Wake"
          minutes={endMinutes}
          onPointerDown={(event) => beginDrag("end", event)}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Duration</p>
          <p className="text-2xl font-semibold text-white whitespace-nowrap leading-tight tabular-nums">{duration}</p>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-4 text-sm text-zinc-300">
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Lights out</p>
          <p className="text-2xl font-semibold text-white">{formatMinutesLabel(startMinutes)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Wake</p>
          <p className="text-2xl font-semibold text-white">{formatMinutesLabel(endMinutes)}</p>
        </div>
      </div>
    </div>
  );
}

type ClockHandleProps = {
  label: string;
  minutes: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

function ClockHandle({ label, minutes, onPointerDown }: ClockHandleProps) {
  const position = useMemo(() => getHandlePosition(minutes), [minutes]);
  const icon = label === "Sleep" ? "🌙" : "🔔";
  return (
    <button
        type="button"
      aria-label={`${label} handle`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown(event);
      }}
      style={{ left: `${(position.x / CLOCK_SIZE) * 100}%`, top: `${(position.y / CLOCK_SIZE) * 100}%` }}
      className="absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white text-xl text-zinc-900 shadow-xl transition hover:scale-105 focus:outline-none cursor-pointer touch-none"
    >
      <span role="presentation">{icon}</span>
    </button>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3V7" />
      <path d="M8 3V7" />
      <path d="M3 11H21" />
      <path d="M8 15H8.01" />
      <path d="M12 15H12.01" />
      <path d="M16 15H16.01" />
      <path d="M8 19H8.01" />
      <path d="M12 19H12.01" />
      <path d="M16 19H16.01" />
    </svg>
  );
}

type MetricLineProps = {
  label: string;
  value: string;
  trend: string;
};

function MetricLine({ label, value, trend }: MetricLineProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
        <p className="text-base font-semibold text-white">{value}</p>
      </div>
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{trend}</p>
    </div>
  );
}

function resolveStartFromEntry(night: SleepEntry, fallback = 0) {
  if (typeof night.startMinutes === "number") return night.startMinutes;
  if (typeof night.endMinutes === "number") {
    return (night.endMinutes - night.durationMins + TOTAL_MINUTES) % TOTAL_MINUTES;
  }
  return fallback;
}

function resolveEndFromEntry(night: SleepEntry, startFallback = 0) {
  if (typeof night.endMinutes === "number") return night.endMinutes;
  const base = typeof night.startMinutes === "number" ? night.startMinutes : startFallback;
  return (base + night.durationMins) % TOTAL_MINUTES;
}

function getRecentSleep(state: JarvisState, limit: number): SleepEntry[] {
  const all = Object.values(state.sleep).flat();
  return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

function computeAverageHours(entries: SleepEntry[]): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((sum, entry) => sum + entry.durationMins, 0);
  return total / entries.length / 60;
}

function computeAverageQuality(entries: SleepEntry[]): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((sum, entry) => sum + entry.quality, 0);
  return total / entries.length;
}

function computeAverageRecovery(entries: SleepEntry[]): number {
  const values = entries.map((entry) => entry.recoveryScore).filter((value): value is number => !!value);
  if (values.length === 0) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function calculateDuration(start: number, end: number) {
  const diff = (end - start + TOTAL_MINUTES) % TOTAL_MINUTES;
  if (diff === 0) return DEFAULT_DURATION;
  return diff;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function snapToFive(minutes: number) {
  return Math.round(minutes / 5) * 5;
}

function applyWindowToSchedule(schedule: SleepSchedule, days: Day[], window: SleepWindow) {
  if (schedule.mode === "daily") {
    return { ...schedule, daily: window };
  }
  if (schedule.mode === "weekdays") {
    return { ...schedule, weekdays: window };
  }
  if (schedule.mode === "weekends") {
    return { ...schedule, weekends: window };
  }
  const custom = { ...schedule.custom };
  days.forEach((day) => {
    custom[day] = { ...window };
  });
  return { ...schedule, custom };
}

function getWindowForDay(schedule: SleepSchedule, day: Day): SleepWindow {
  if (schedule.mode === "custom") {
    return schedule.custom[day];
  }
  if (schedule.mode === "daily") {
    return schedule.daily;
  }
  if (schedule.mode === "weekdays") {
    return isWeekday(day) ? schedule.weekdays : schedule.weekends;
  }
  if (schedule.mode === "weekends") {
    return isWeekend(day) ? schedule.weekends : schedule.weekdays;
  }
  return schedule.daily;
}

function formatEditingSummary(mode: SleepPresetMode, days: Day[]) {
  switch (mode) {
    case "daily":
      return "Editing: Last night";
    case "weekdays":
      return "Editing: Monday–Friday";
    case "weekends":
      return "Editing: Weekends";
    case "custom":
    default:
      return `Editing: ${days.map((day) => dayLabels[day].short).join(", ")}`;
  }
}

function resolveFocusForMode(mode: SleepPresetMode, candidate: Day, lastNight: Day): Day {
  if (mode === "daily") return lastNight;
  if (mode === "weekdays" && isWeekend(candidate)) return 1;
  if (mode === "weekends" && isWeekday(candidate)) return 6;
  return candidate;
}

function getRecentDayKeyForWeekday(day: Day) {
  const today = new Date();
  const todayDay = today.getDay() as Day;
  let diff = day - todayDay;
  if (diff > 0) {
    diff -= 7;
  }
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return getDayKey(target);
}

function isWeekend(day: Day) {
  return day === 0 || day === 6;
}

function isWeekday(day: Day) {
  return !isWeekend(day);
}

function buildArcSegments(start: number, end: number) {
  const diff = (end - start + DIAL_MINUTES) % DIAL_MINUTES;
  if (diff === 0) {
    return [{ start: 0, end: DIAL_MINUTES }];
  }
  if (end >= start) {
    return [{ start, end }];
  }
  return [
    { start, end: DIAL_MINUTES },
    { start: 0, end },
  ];
}

function describeArc(start: number, end: number) {
  const radius = CLOCK_RADIUS;
  const center = CLOCK_SIZE / 2;
  const startAngle = minutesToDegrees(start);
  const endAngle = minutesToDegrees(end);
  const startPoint = polarToCartesian(center, center, radius, startAngle);
  const endPoint = polarToCartesian(center, center, radius, endAngle);
  const sweep = (end - start + DIAL_MINUTES) % DIAL_MINUTES;
  const largeArcFlag = sweep > DIAL_MINUTES / 2 ? 1 : 0;
  const sweepFlag = 1;
  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x} ${endPoint.y}`;
}

function minutesToDegrees(minutes: number) {
  return ((minutes / DIAL_MINUTES) * 360) - 90;
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function getHandlePosition(minutes: number) {
  const radius = CLOCK_RADIUS;
  const center = CLOCK_SIZE / 2;
  const angle = minutesToDegrees(minutes % DIAL_MINUTES);
  return polarToCartesian(center, center, radius, angle);
}

function dialMinutesToDayMinutes(dialMinutes: number, currentMinutes: number) {
  const normalizedCurrent =
    ((currentMinutes % TOTAL_MINUTES) + TOTAL_MINUTES) % TOTAL_MINUTES;
  const candidates = [dialMinutes, dialMinutes + DIAL_MINUTES];
  const distances = candidates.map((candidate) => {
    const diff = Math.abs(normalizedCurrent - candidate);
    return Math.min(diff, TOTAL_MINUTES - diff);
  });
  const bestIndex = distances[0] <= distances[1] ? 0 : 1;
  return candidates[bestIndex] % TOTAL_MINUTES;
}

function formatWindowLabel(entry: SleepEntry) {
  const start = entry.startMinutes ?? 0;
  const end = entry.endMinutes ?? ((start + entry.durationMins) % TOTAL_MINUTES);
  return `${formatMinutesLabel(start)} → ${formatMinutesLabel(end)}`;
}
