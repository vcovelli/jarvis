"use client";

import { useSearchParams } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
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
const DEFAULT_DURATION = 8 * 60;
const CLOCK_SIZE = 340;
const CLOCK_RADIUS = 130;
const allDays: Day[] = [0, 1, 2, 3, 4, 5, 6];
const modeOptions: { label: string; value: SleepPresetMode }[] = [
  { label: "Daily", value: "daily" },
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
  const { state, hydrated, logSleep, updateSleepSchedule } = useJarvisState();
  const { showToast } = useToast();
  const search = useSearchParams();
  const todayDay = getDayOfWeek();
  const schedule = state.sleepSchedule;
  const defaultFocus = schedule.lastEditedDay ?? todayDay;
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
  const focusNightId = search?.get("focus");
  const focusQueryDay = search?.get("day");
  const focusNightRef = useRef<HTMLDivElement | null>(null);

  const editingDays = useMemo(() => {
    switch (schedule.mode) {
      case "daily":
        return allDays;
      case "weekdays":
        return [1, 2, 3, 4, 5];
      case "weekends":
        return [0, 6];
      case "custom":
      default:
        return customDays.length ? customDays : [focusedDay];
    }
  }, [schedule.mode, customDays, focusedDay]);

  useEffect(() => {
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
  }, [schedule, focusedDay]);

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
    if (
      schedule.lastEditedDay !== undefined &&
      schedule.lastEditedDay !== focusedDay &&
      !focusQueryDay
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFocusedDay(schedule.lastEditedDay);
    }
  }, [schedule.lastEditedDay, focusedDay, focusQueryDay]);

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
      const nextWindow: SleepWindow = {
        lightsOut: minutesToTimeString(snappedStart),
        wake: minutesToTimeString(snappedEnd),
      };
      const nextSchedule = applyWindowToSchedule(schedule, editingDays, nextWindow);
      updateSleepSchedule({ ...nextSchedule, lastEditedDay: focusedDay });
    },
    [schedule, editingDays, focusedDay, updateSleepSchedule],
  );

  const handleModeChange = useCallback(
    (mode: SleepPresetMode) => {
      if (mode === schedule.mode) return;
      const nextFocus = resolveFocusForMode(mode, focusedDay);
      if (mode === "custom" && !customDays.includes(nextFocus)) {
        setCustomDays([nextFocus]);
      }
      if (mode !== "custom") {
        setCustomDays([nextFocus]);
      }
      setFocusedDay(nextFocus);
      updateSleepSchedule({ ...schedule, mode, lastEditedDay: nextFocus });
    },
    [schedule, focusedDay, customDays, updateSleepSchedule],
  );

  const handleCustomDayToggle = useCallback(
    (day: Day) => {
      if (schedule.mode !== "custom") return;
      let next = customDays.includes(day)
        ? customDays.filter((value) => value !== day)
        : [...customDays, day];
      if (next.length === 0) {
        next = [day];
      }
      setCustomDays(next);
      setFocusedDay(day);
      updateSleepSchedule({ ...schedule, lastEditedDay: day });
    },
    [schedule, customDays, updateSleepSchedule],
  );

  const handleSubmit = useCallback(
    (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const dayKey = getRecentDayKeyForWeekday(focusedDay);
      logSleep({
        day: dayKey,
        durationMins: durationMins || DEFAULT_DURATION,
        quality,
        recoveryScore: recovery,
        startMinutes,
        endMinutes,
        dreams,
        notes,
      });
      setDreams("");
      setNotes("");
      showToast(`Sleep logged for ${dayLabels[focusedDay].long}`);
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

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading sleep log…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Sleep</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Recharge console</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Drag bedtime + wakeup on the clock, log recovery rituals, and connect dreams with daytime focus.
        </p>
      </header>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Night editor</h2>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{durationLabel}</p>
          </div>
          <div className="flex w-full flex-col items-start gap-3 lg:w-auto lg:items-end">
            <div className="flex flex-wrap gap-1 rounded-full border border-white/10 bg-black/30 p-1">
              {modeOptions.map((option) => {
                const active = schedule.mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleModeChange(option.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                      active ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {schedule.mode === "custom" ? (
              <div className="flex flex-col items-start gap-2">
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
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{editingSummary}</p>
              </div>
            ) : (
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{editingSummary}</p>
            )}
          </div>
        </div>
        <div className="mt-8 grid gap-10 lg:grid-cols-[1.2fr,1fr]">
          <SleepClock startMinutes={startMinutes} endMinutes={endMinutes} onChange={handleClockChange} />
          <form className="flex flex-col gap-5" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              Logging: {dayLabels[focusedDay].long}
            </p>
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
            <textarea
              value={dreams}
              onChange={(event) => setDreams(event.target.value)}
              rows={3}
              placeholder="Dream notes, symbols, themes"
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Recovery notes, habits, or HRV cues"
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
            >
              Log sleep
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2">
          <div className="flex items-center justify-between">
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
                const highlight = night.id === focusNightId;
                return (
                  <article
                    key={night.id}
                    ref={highlight ? focusNightRef : undefined}
                    className={`rounded-2xl border border-white/5 bg-black/30 p-4 ${highlight ? "ring-2 ring-cyan-300/70" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
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
                    <div className="text-right text-xs text-zinc-400">
                      <p>{formatWindowLabel(night)}</p>
                      <p>
                        Quality {night.quality}/5
                        {night.recoveryScore ? ` • Recovery ${night.recoveryScore}/5` : ""}
                      </p>
                    </div>
                  </div>
                  {(night.dreams || night.notes) && (
                    <div className="mt-3 space-y-2 text-sm text-zinc-300">
                      {night.dreams && <p>Dreams: {night.dreams}</p>}
                      {night.notes && <p>Recovery: {night.notes}</p>}
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

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!draggingRef.current) return;
      const dial = dialRef.current;
      if (!dial) return;
      const rect = dial.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const angle = Math.atan2(dy, dx);
      const degrees = ((angle * 180) / Math.PI + 450) % 360;
      const minutes = snapToFive(Math.round((degrees / 360) * TOTAL_MINUTES) % TOTAL_MINUTES);
      if (draggingRef.current === "start") {
        onChange({ startMinutes: minutes, endMinutes });
      } else {
        onChange({ startMinutes, endMinutes: minutes });
      }
    }

    function handleUp() {
      draggingRef.current = null;
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [startMinutes, endMinutes, onChange]);

  const segments = buildArcSegments(startMinutes, endMinutes);
  const durationMins = calculateDuration(startMinutes, endMinutes);
  const duration = formatDuration(durationMins);

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        ref={dialRef}
        className="relative select-none"
        style={{ width: CLOCK_SIZE, height: CLOCK_SIZE }}
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
          {Array.from({ length: 24 }).map((_, index) => {
            const angle = (index * 15 - 90) * (Math.PI / 180);
            const outer = CLOCK_RADIUS - 4;
            const inner = outer - (index % 2 === 0 ? 16 : 8);
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
                stroke={index % 2 === 0 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"}
                strokeWidth={index % 2 === 0 ? 3 : 1}
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
          onPointerDown={() => {
            draggingRef.current = "start";
          }}
        />
        <ClockHandle
          label="Wake"
          minutes={endMinutes}
          onPointerDown={() => {
            draggingRef.current = "end";
          }}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Duration</p>
          <p className="text-2xl font-semibold text-white">{duration}</p>
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
  onPointerDown: () => void;
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
        onPointerDown();
      }}
      style={{ left: position.x, top: position.y }}
      className="absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white text-xl text-zinc-900 shadow-xl transition hover:scale-105 focus:outline-none cursor-pointer"
    >
      <span role="presentation">{icon}</span>
    </button>
  );
}

type MetricLineProps = {
  label: string;
  value: string;
  trend: string;
};

function MetricLine({ label, value, trend }: MetricLineProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{label}</p>
        <p className="text-base font-semibold text-white">{value}</p>
      </div>
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">{trend}</p>
    </div>
  );
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
      return "Editing: All days";
    case "weekdays":
      return "Editing: Monday–Friday";
    case "weekends":
      return "Editing: Weekends";
    case "custom":
    default:
      return `Editing: ${days.map((day) => dayLabels[day].short).join(", ")}`;
  }
}

function resolveFocusForMode(mode: SleepPresetMode, candidate: Day): Day {
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
  const diff = (end - start + TOTAL_MINUTES) % TOTAL_MINUTES;
  if (diff === 0) {
    return [{ start: 0, end: TOTAL_MINUTES }];
  }
  if (end >= start) {
    return [{ start, end }];
  }
  return [
    { start, end: TOTAL_MINUTES },
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
  const sweep = (end - start + TOTAL_MINUTES) % TOTAL_MINUTES;
  const largeArcFlag = sweep > TOTAL_MINUTES / 2 ? 1 : 0;
  const sweepFlag = 1;
  return `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endPoint.x} ${endPoint.y}`;
}

function minutesToDegrees(minutes: number) {
  return ((minutes / TOTAL_MINUTES) * 360) - 90;
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
  const angle = minutesToDegrees(minutes);
  return polarToCartesian(center, center, radius, angle);
}

function formatWindowLabel(entry: SleepEntry) {
  const start = entry.startMinutes ?? 0;
  const end = entry.endMinutes ?? ((start + entry.durationMins) % TOTAL_MINUTES);
  return `${formatMinutesLabel(start)} → ${formatMinutesLabel(end)}`;
}
