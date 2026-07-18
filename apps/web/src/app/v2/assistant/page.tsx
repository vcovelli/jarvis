"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  Day,
  DayKey,
  MoodTag,
  TodoPriority,
  dayKeyToDate,
  defaultMoodTags,
  getDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";
import { useToast } from "@/components/Toast";
import { formatMinutesLabel, parseTimeToMinutes } from "@/lib/timeDisplay";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type PendingAction =
  | {
      type: "mood";
      payload: {
        mood?: number;
        note?: string;
        tags?: string[];
      };
      missing: Array<"mood">;
    }
  | {
      type: "journal";
      payload: {
        text?: string;
        prompt?: "morning" | "priority" | "free";
      };
      missing: Array<"text">;
    }
  | {
      type: "todo";
      payload: {
        text?: string;
        day?: DayKey;
        timeblockMins?: number;
        startTime?: string;
        endTime?: string;
        priority?: TodoPriority;
        color?: string;
        icon?: string;
        repeatType?: RepeatType;
        repeatWeekdays?: Day[];
        repeatMonthDay?: number;
      };
      missing: Array<"text">;
    }
  | {
      type: "sleep";
      payload: {
        durationMins?: number;
        quality?: number;
        recoveryScore?: number;
        day?: DayKey;
        startMinutes?: number;
        endMinutes?: number;
        dreams?: string;
        notes?: string;
      };
      missing: Array<"duration" | "quality">;
    };

const TOTAL_MINUTES = 24 * 60;
const DIAL_MINUTES = 12 * 60;
const DEFAULT_DURATION = 8 * 60;
const CLOCK_SIZE = 340;
const CLOCK_RADIUS = 130;
const timeblockOptions = buildStartTimeOptions(15);
const blockColors = [
  "#f472b6",
  "#f97316",
  "#facc15",
  "#34d399",
  "#2dd4bf",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#f87171",
  "#fb7185",
  "#38bdf8",
  "#4ade80",
];
const taskIconOptions = [
  { id: "alarm", label: "Alarm", symbol: "⏰" },
  { id: "sunrise", label: "Sunrise", symbol: "🌅" },
  { id: "coffee", label: "Coffee", symbol: "☕" },
  { id: "dumbbell", label: "Workout", symbol: "🏋️" },
  { id: "book", label: "Study", symbol: "📘" },
  { id: "moon", label: "Night", symbol: "🌙" },
  { id: "spark", label: "Focus", symbol: "⚡" },
  { id: "laptop", label: "Deep work", symbol: "💻" },
  { id: "calendar", label: "Meeting", symbol: "📅" },
  { id: "phone", label: "Call", symbol: "📞" },
  { id: "email", label: "Email", symbol: "✉️" },
  { id: "pen", label: "Write", symbol: "📝" },
  { id: "chart", label: "Finance", symbol: "📈" },
  { id: "cart", label: "Errands", symbol: "🛒" },
  { id: "food", label: "Meal", symbol: "🍽️" },
  { id: "car", label: "Commute", symbol: "🚗" },
  { id: "broom", label: "Clean", symbol: "🧹" },
  { id: "heart", label: "Health", symbol: "❤️" },
];
const defaultBlockColor = blockColors[0];
const defaultTaskIcon = taskIconOptions[0].id;
const repeatDayLabels: Array<{ day: Day; label: string }> = [
  { day: 0, label: "Sun" },
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
];
const repeatHorizonDays = 60;
type RepeatType = "none" | "weekly" | "monthly";

export default function AssistantPage() {
  const {
    state,
    logMood,
    addJournal,
    addTodo,
    logSleep,
    addMoodTag,
    renameMoodTag,
    deleteMoodTag,
  } = useJarvisState();
  const { showToast } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [draft, setDraft] = useState<PendingAction | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const dayOptions = useMemo(() => buildDayOptions(14), []);
  const sleepDefaultDay = useMemo(() => getDefaultSleepDay(), []);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newTagValue, setNewTagValue] = useState("");

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
  const knownMoodTags = useMemo(
    () => moodTagOptions.map((tag) => tag.toLowerCase()),
    [moodTagOptions],
  );

  useEffect(() => {
    const node = conversationRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, pending, draft]);

  const appendMessage = useCallback((role: Message["role"], text: string) => {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text },
    ]);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    appendMessage("user", trimmed);

    if (pending) {
      const resolved = applyAnswer(pending, trimmed);
      if (resolved.missing.length) {
        setPending(resolved);
        appendMessage("assistant", buildClarifier(resolved));
        return;
      }
      setPending(null);
      setDraft(resolved);
      appendMessage("assistant", "Review the details below and confirm.");
      return;
    }

    if (isHelpRequest(trimmed)) {
      appendMessage("assistant", buildHelpText());
      return;
    }

    const parsed = parseCommand(trimmed, knownMoodTags);
    if (!parsed) {
      appendMessage(
        "assistant",
        "I can help log mood, journal, sleep, or todos. Try 'help' for examples.",
      );
      return;
    }

    if (parsed.missing.length) {
      setPending(parsed);
      setDraft(null);
      appendMessage("assistant", buildClarifier(parsed));
      return;
    }

    setDraft(parsed);
    appendMessage("assistant", "Review the details below and confirm.");
  }, [appendMessage, input, knownMoodTags, pending]);

  const runAction = useCallback(
    (action: PendingAction) => {
      const summary = buildActionSummary(action);
      switch (action.type) {
        case "mood": {
          if (!action.payload.mood) return;
          logMood({
            mood: action.payload.mood,
            note: action.payload.note,
            tags: action.payload.tags ?? [],
          });
          appendMessage("assistant", summary);
          showToast("Mood logged");
          break;
        }
        case "journal": {
          if (!action.payload.text) return;
          addJournal({
            text: action.payload.text,
            prompt: action.payload.prompt,
          });
          appendMessage("assistant", summary);
          showToast("Journal entry saved");
          break;
        }
        case "todo": {
          if (!action.payload.text) return;
          const computedTimeblock = computeTimeblockFromTimes(
            action.payload.startTime,
            action.payload.endTime,
          );
          const repeatType = action.payload.repeatType ?? "none";
          const repeatDays = buildRepeatDays({
            startDay: action.payload.day ?? getDayKey(),
            repeatType,
            repeatWeekdays: action.payload.repeatWeekdays ?? [],
            repeatMonthDay: action.payload.repeatMonthDay ?? dayKeyToDate(action.payload.day ?? getDayKey()).getDate(),
            horizonDays: repeatHorizonDays,
          });
          const seriesId = repeatType === "none" ? undefined : createSeriesId();
          const basePayload = {
            text: action.payload.text,
            priority: action.payload.priority ?? 2,
            timeblockMins: computedTimeblock ?? action.payload.timeblockMins,
            startTime: action.payload.startTime,
            color: action.payload.color,
            icon: action.payload.icon,
            seriesId,
          };
          if (repeatType === "none") {
            addTodo({
              ...basePayload,
              day: action.payload.day,
            });
          } else {
            repeatDays.forEach((day) => {
              addTodo({
                ...basePayload,
                day,
              });
            });
          }
          appendMessage("assistant", summary);
          showToast("Todo scheduled");
          break;
        }
        case "sleep": {
          if (!action.payload.durationMins || !action.payload.quality) return;
          const duration =
            action.payload.startMinutes !== undefined && action.payload.endMinutes !== undefined
              ? calculateDuration(action.payload.startMinutes, action.payload.endMinutes)
              : action.payload.durationMins;
          logSleep({
            durationMins: duration,
            quality: action.payload.quality,
            recoveryScore: action.payload.recoveryScore,
            day: action.payload.day,
            startMinutes: action.payload.startMinutes,
            endMinutes: action.payload.endMinutes,
            dreams: action.payload.dreams,
            notes: action.payload.notes,
          });
          appendMessage("assistant", summary);
          showToast("Sleep logged");
          break;
        }
        default:
          break;
      }
    },
    [addJournal, addTodo, appendMessage, logMood, logSleep, showToast],
  );

  const moodValue = draft?.type === "mood" ? draft.payload.mood ?? 5 : 5;
  const moodTone = useMemo(() => {
    if (moodValue <= 3) {
      return { text: "text-rose-300", accent: "#f87171" };
    }
    if (moodValue <= 5) {
      return { text: "text-amber-300", accent: "#fbbf24" };
    }
    if (moodValue <= 7) {
      return { text: "text-lime-300", accent: "#84cc16" };
    }
    return { text: "text-emerald-300", accent: "#34d399" };
  }, [moodValue]);
  const moodPercent = useMemo(() => ((moodValue - 1) / 9) * 100, [moodValue]);

  const handleAddMoodTag = useCallback(() => {
    const trimmed = newTagValue.trim();
    if (!trimmed) return;
    addMoodTag({ tag: trimmed });
    setNewTagValue("");
    setTagManagerOpen(false);
    showToast("Mood tag added");
  }, [addMoodTag, newTagValue, showToast]);

  const handleRenameMoodTag = useCallback(
    (tag: string) => {
      const next = window.prompt("Rename tag", tag);
      if (!next) return;
      const trimmed = next.trim();
      if (!trimmed || trimmed === tag) return;
      renameMoodTag({ from: tag, to: trimmed });
      setDraft((current) => {
        if (!current || current.type !== "mood") return current;
        const currentTags = current.payload.tags ?? [];
        if (!currentTags.includes(tag)) return current;
        const nextTags = currentTags.map((value) => (value === tag ? trimmed : value));
        return { ...current, payload: { ...current.payload, tags: nextTags } };
      });
      showToast("Mood tag updated");
    },
    [renameMoodTag, showToast],
  );

  const handleDeleteMoodTag = useCallback(
    (tag: string) => {
      const confirmed = window.confirm(`Remove "${tag}" from quick tags?`);
      if (!confirmed) return;
      deleteMoodTag({ tag });
      setDraft((current) => {
        if (!current || current.type !== "mood") return current;
        const currentTags = current.payload.tags ?? [];
        if (!currentTags.includes(tag)) return current;
        return {
          ...current,
          payload: { ...current.payload, tags: currentTags.filter((value) => value !== tag) },
        };
      });
      showToast("Mood tag removed");
    },
    [deleteMoodTag, showToast],
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80">Assistant</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Command Chat</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Type a quick command to log mood, journal, sleep, or schedule todos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => appendMessage("assistant", buildHelpText())}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
          >
            Examples
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Log mood", action: "mood" },
            { label: "Log journal", action: "journal" },
            { label: "Log sleep", action: "sleep" },
            { label: "Add todo", action: "todo" },
          ].map((item) => (
            <button
              key={item.action}
              type="button"
              onClick={() => {
                if (item.action === "mood") {
                  setDraft({
                    type: "mood",
                    payload: { mood: 5, note: "", tags: [] },
                    missing: [],
                  });
                  setTagManagerOpen(false);
                  setNewTagValue("");
                }
                if (item.action === "journal") {
                  setDraft({
                    type: "journal",
                    payload: { text: "", prompt: "free" },
                    missing: ["text"],
                  });
                }
                if (item.action === "sleep") {
                  setDraft({
                    type: "sleep",
                    payload: {
                      durationMins: DEFAULT_DURATION,
                      quality: 3,
                      recoveryScore: 3,
                      day: sleepDefaultDay,
                      startMinutes: 23 * 60,
                      endMinutes: 7 * 60,
                    },
                    missing: [],
                  });
                }
                if (item.action === "todo") {
                  setDraft({
                    type: "todo",
                    payload: {
                      text: "",
                      day: getDayKey(),
                      timeblockMins: 30,
                      startTime: "",
                      endTime: "",
                      priority: 2,
                      color: defaultBlockColor,
                      icon: defaultTaskIcon,
                      repeatType: "none",
                      repeatWeekdays: [],
                      repeatMonthDay: dayKeyToDate(getDayKey()).getDate(),
                    },
                    missing: ["text"],
                  });
                }
                setPending(null);
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          ref={conversationRef}
          className="mt-6 max-h-[420px] space-y-3 overflow-y-auto pr-2"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Start with a command. I’ll ask clarifying questions if needed.
            </p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[520px] rounded-2xl px-4 py-3 text-sm shadow-lg ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-cyan-400/30 to-emerald-400/20 text-white"
                      : "bg-black/40 text-zinc-100"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/50">
                    {message.role === "user" ? "You" : "Assistant"}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{message.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {pending && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-200">
            <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
              Pending {pending.type}
            </p>
            <p className="mt-1">{buildPendingSummary(pending)}</p>
          </div>
        )}
        {draft && (
          <div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-4 text-sm text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                  Confirm {draft.type}
                </p>
                <p className="mt-1 text-sm text-white/90">
                  {draft.type === "sleep"
                    ? `Duration ${formatDuration(
                        draft.payload.durationMins ?? DEFAULT_DURATION,
                      )}, quality ${draft.payload.quality ?? "?"}, recovery ${
                        draft.payload.recoveryScore ?? "?"
                      }.`
                    : buildPendingSummary(draft)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
              >
                Cancel
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {draft.type === "todo" && (
                <>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Task
                    <input
                      value={draft.payload.text ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo"
                            ? {
                                ...current,
                                payload: { ...current.payload, text: event.target.value },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Day
                    <select
                      value={draft.payload.day ?? getDayKey()}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  day: event.target.value as DayKey,
                                },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      {dayOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Start time
                    <div className="sm:hidden">
                      <TimePillSelector
                        label="Start time"
                        value={draft.payload.startTime ?? ""}
                        options={timeblockOptions}
                        onChange={(value) =>
                          setDraft((current) =>
                            current && current.type === "todo"
                              ? {
                                  ...current,
                                  payload: {
                                    ...current.payload,
                                    startTime: value,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                    <div className="hidden sm:block">
                      <select
                        value={draft.payload.startTime ?? ""}
                        onChange={(event) =>
                          setDraft((current) =>
                            current && current.type === "todo"
                              ? {
                                  ...current,
                                  payload: {
                                    ...current.payload,
                                    startTime: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      >
                        <option value="">--</option>
                        {timeblockOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    End time
                    <div className="sm:hidden">
                      <TimePillSelector
                        label="End time"
                        value={draft.payload.endTime ?? ""}
                        options={timeblockOptions}
                        onChange={(value) =>
                          setDraft((current) =>
                            current && current.type === "todo"
                              ? {
                                  ...current,
                                  payload: {
                                    ...current.payload,
                                    endTime: value,
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </div>
                    <div className="hidden sm:block">
                      <select
                        value={draft.payload.endTime ?? ""}
                        onChange={(event) =>
                          setDraft((current) =>
                            current && current.type === "todo"
                              ? {
                                  ...current,
                                  payload: {
                                    ...current.payload,
                                    endTime: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      >
                        <option value="">--</option>
                        {timeblockOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Priority
                    <select
                      value={(draft.payload.priority ?? 2).toString()}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  priority: Number(event.target.value) as TodoPriority,
                                },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      <option value="1">High</option>
                      <option value="2">Medium</option>
                      <option value="3">Low</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Repeat
                    <select
                      value={draft.payload.repeatType ?? "none"}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "todo"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  repeatType: event.target.value as RepeatType,
                                  repeatWeekdays: current.payload.repeatWeekdays ?? [],
                                  repeatMonthDay:
                                    current.payload.repeatMonthDay ??
                                    dayKeyToDate(current.payload.day ?? getDayKey()).getDate(),
                                },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      <option value="none">Once</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  {draft.payload.repeatType === "weekly" && (
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      {repeatDayLabels.map((day) => {
                        const active = draft.payload.repeatWeekdays?.includes(day.day);
                        return (
                          <button
                            key={day.day}
                            type="button"
                            onClick={() =>
                              setDraft((current) => {
                                if (!current || current.type !== "todo") return current;
                                const currentDays = current.payload.repeatWeekdays ?? [];
                                const nextDays = active
                                  ? currentDays.filter((value) => value !== day.day)
                                  : [...currentDays, day.day];
                                return {
                                  ...current,
                                  payload: { ...current.payload, repeatWeekdays: nextDays },
                                };
                              })
                            }
                            className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] ${
                              active ? "bg-emerald-300 text-zinc-900" : "border border-white/15 text-white/70"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {draft.payload.repeatType === "monthly" && (
                    <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                      Repeat day
                      <select
                        value={(draft.payload.repeatMonthDay ?? dayKeyToDate(draft.payload.day ?? getDayKey()).getDate()).toString()}
                        onChange={(event) =>
                          setDraft((current) =>
                            current && current.type === "todo"
                              ? {
                                  ...current,
                                  payload: {
                                    ...current.payload,
                                    repeatMonthDay: Number(event.target.value),
                                  },
                                }
                              : current,
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      >
                        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                          <option key={day} value={day}>
                            Day {day}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Color
                    <div className="flex flex-wrap gap-2">
                      {blockColors.map((hex) => {
                        const active = draft.payload.color === hex;
                        return (
                          <button
                            key={hex}
                            type="button"
                            onClick={() =>
                              setDraft((current) =>
                                current && current.type === "todo"
                                  ? {
                                      ...current,
                                      payload: { ...current.payload, color: hex },
                                    }
                                  : current,
                              )
                            }
                            className={`h-8 w-8 rounded-full border-2 transition ${
                              active ? "border-white shadow-lg" : "border-white/20"
                            }`}
                            style={{ backgroundColor: hex }}
                            aria-label={`Select color ${hex}`}
                          />
                        );
                      })}
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Icon
                    <div className="flex flex-wrap gap-2">
                      {taskIconOptions.map((icon) => {
                        const active = draft.payload.icon === icon.id;
                        return (
                          <button
                            key={icon.id}
                            type="button"
                            onClick={() =>
                              setDraft((current) =>
                                current && current.type === "todo"
                                  ? {
                                      ...current,
                                      payload: { ...current.payload, icon: icon.id },
                                    }
                                  : current,
                              )
                            }
                            className={`flex h-9 w-9 items-center justify-center rounded-full border text-base transition ${
                              active ? "border-white bg-white/10 text-white" : "border-white/20 text-white/70"
                            }`}
                            aria-label={`Select ${icon.label}`}
                          >
                            {icon.symbol}
                          </button>
                        );
                      })}
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Custom emoji
                    <input
                      value={
                        draft.payload.icon && taskIconOptions.some((option) => option.id === draft.payload.icon)
                          ? ""
                          : draft.payload.icon ?? ""
                      }
                      onChange={(event) => {
                        const trimmed = event.target.value.trim();
                        if (!trimmed) return;
                        setDraft((current) =>
                          current && current.type === "todo"
                            ? {
                                ...current,
                                payload: { ...current.payload, icon: trimmed },
                              }
                            : current,
                        );
                      }}
                      maxLength={4}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      placeholder="e.g. 🧠"
                    />
                  </label>
                </>
              )}
              {draft.type === "mood" && (
                <>
                  <div className="sm:col-span-2">
                    <label className="text-sm font-medium text-zinc-200">
                      Mood: <span className={`slider-emphasis ${moodTone.text}`}>{moodValue}/10</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={moodValue}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "mood"
                            ? {
                                ...current,
                                payload: { ...current.payload, mood: Number(event.target.value) || 1 },
                              }
                            : current,
                        )
                      }
                      className="mt-2 h-2 w-full cursor-pointer appearance-none rounded bg-transparent"
                      style={{
                        accentColor: moodTone.accent,
                        background: `linear-gradient(90deg, ${moodTone.accent} 0%, ${moodTone.accent} ${moodPercent}%, #3f3f46 ${moodPercent}%, #3f3f46 100%)`,
                      }}
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70">
                    Note
                    <input
                      value={draft.payload.note ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "mood"
                            ? {
                                ...current,
                                payload: { ...current.payload, note: event.target.value },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Tags
                    <div className="flex flex-wrap gap-2">
                      {moodTagOptions.map((tag) => {
                        const active = draft.payload.tags?.includes(tag);
                        const normalized = tag.toLowerCase();
                        const isCustom = !builtInMoodTagSet.has(normalized);
                        return (
                          <div key={tag} className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((current) => {
                                  if (!current || current.type !== "mood") return current;
                                  const currentTags = current.payload.tags ?? [];
                                  const nextTags = active
                                    ? currentTags.filter((value) => value !== tag)
                                    : [...currentTags, tag];
                                  return {
                                    ...current,
                                    payload: { ...current.payload, tags: nextTags },
                                  };
                                })
                              }
                              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] transition ${
                                active
                                  ? "bg-cyan-300 text-zinc-900"
                                  : "bg-white/10 text-zinc-300"
                              }`}
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
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => setTagManagerOpen((prev) => !prev)}
                    className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                      tagManagerOpen ? "bg-cyan-300/20 text-cyan-100" : "bg-white/10 text-zinc-400"
                    }`}
                  >
                    {tagManagerOpen ? "Done" : "+ Tag"}
                  </button>
                  {tagManagerOpen && (
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
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
                </>
              )}
              {draft.type === "journal" && (
                <>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    {(["morning", "priority", "free"] as const).map((prompt) => {
                      const active = draft.payload.prompt === prompt;
                      return (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() =>
                            setDraft((current) =>
                              current && current.type === "journal"
                                ? {
                                    ...current,
                                    payload: { ...current.payload, prompt },
                                  }
                                : current,
                            )
                          }
                          className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] ${
                            active
                              ? "bg-emerald-300 text-zinc-900"
                              : "border border-white/15 text-white/70"
                          }`}
                        >
                          {prompt}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Entry
                    <textarea
                      value={draft.payload.text ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "journal"
                            ? {
                                ...current,
                                payload: { ...current.payload, text: event.target.value },
                              }
                            : current,
                        )
                      }
                      rows={3}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </label>
                </>
              )}
              {draft.type === "sleep" && (
                <>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Day
                    <select
                      value={draft.payload.day ?? getDefaultSleepDay()}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  day: event.target.value as DayKey,
                                },
                              }
                            : current,
                        )
                      }
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    >
                      {dayOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    <SleepClock
                      startMinutes={draft.payload.startMinutes ?? 23 * 60}
                      endMinutes={draft.payload.endMinutes ?? 7 * 60}
                      onChange={(range) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: {
                                  ...current.payload,
                                  startMinutes: range.startMinutes,
                                  endMinutes: range.endMinutes,
                                  durationMins: calculateDuration(range.startMinutes, range.endMinutes),
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                    <SliderField
                      label="Quality"
                      value={draft.payload.quality ?? 3}
                      min={1}
                      max={5}
                      onChange={(value) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, quality: value },
                              }
                            : current,
                        )
                      }
                      suffix="/5"
                    />
                    <SliderField
                      label="Recovery"
                      value={draft.payload.recoveryScore ?? 3}
                      min={1}
                      max={5}
                      onChange={(value) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, recoveryScore: value },
                              }
                            : current,
                        )
                      }
                      suffix="/5"
                    />
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Dreams
                    <textarea
                      value={draft.payload.dreams ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, dreams: event.target.value },
                              }
                            : current,
                        )
                      }
                      rows={2}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      placeholder="Symbols, themes, or recall"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.3em] text-emerald-100/70 sm:col-span-2">
                    Recovery notes
                    <textarea
                      value={draft.payload.notes ?? ""}
                      onChange={(event) =>
                        setDraft((current) =>
                          current && current.type === "sleep"
                            ? {
                                ...current,
                                payload: { ...current.payload, notes: event.target.value },
                              }
                            : current,
                        )
                      }
                      rows={2}
                      className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                      placeholder="HRV, soreness, habits, or sleep quality notes"
                    />
                  </label>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!draft) return;
                  runAction(draft);
                  setDraft(null);
                }}
                className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/70 hover:text-white"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            placeholder="e.g. log mood 7 stressed note: long day"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setPending(null);
                setDraft(null);
                setTagManagerOpen(false);
                setNewTagValue("");
              }}
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 hover:text-white"
            >
              Clear
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function isHelpRequest(text: string) {
  const normalized = text.trim().toLowerCase();
  return ["help", "examples", "commands", "?"].includes(normalized);
}

function buildHelpText() {
  return [
    "Try commands like:",
    "- log mood 7 stressed note: long day",
    "- journal morning: shipped new feature, feeling focused",
    "- add todo review deck tomorrow at 9am for 45m",
    "- sleep 7.5h quality 4 recovery 3 yesterday",
  ].join("\n");
}

function parseCommand(input: string, knownMoodTags: string[]): PendingAction | null {
  const normalized = input.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith("mood") || lower.startsWith("log mood")) {
    return parseMoodCommand(normalized, knownMoodTags);
  }
  if (lower.startsWith("journal") || lower.startsWith("note")) {
    return parseJournalCommand(normalized);
  }
  if (lower.startsWith("todo") || lower.startsWith("task") || lower.startsWith("add ")) {
    return parseTodoCommand(normalized);
  }
  if (lower.startsWith("sleep") || lower.startsWith("log sleep")) {
    return parseSleepCommand(normalized);
  }
  return null;
}

function parseMoodCommand(input: string, knownMoodTags: string[]): PendingAction {
  const mood = extractMoodScore(input);
  const note = extractNote(input);
  const tags = extractTags(input, knownMoodTags);
  const missing: Array<"mood"> = mood ? [] : ["mood"];
  return {
    type: "mood",
    payload: { mood, note, tags },
    missing,
  };
}

function parseJournalCommand(input: string): PendingAction {
  const cleaned = input.replace(/^journal\s*/i, "").replace(/^note\s*/i, "");
  const prompt = extractPrompt(cleaned);
  const text = cleaned.replace(/^(morning|priority|free)\s*[:\-]\s*/i, "").trim();
  const missing: Array<"text"> = text ? [] : ["text"];
  return {
    type: "journal",
    payload: { text, prompt },
    missing,
  };
}

function parseTodoCommand(input: string): PendingAction {
  const shouldDropLeadingArticle = /\b(task|todo)\b/i.test(input);
  const cleaned = input
    .replace(/^add\s+/i, "")
    .replace(/^todo\s*/i, "")
    .replace(/^task\s*/i, "");
  const range = extractTimeRange(cleaned);
  const day = extractDayKey(cleaned);
  const timeblockMins = range?.durationMins ?? extractDurationMinutes(cleaned);
  const startTime = range?.startTime ?? extractTime(cleaned);
  const priority = extractPriority(cleaned);
  const rawText = stripCommandMetadata(cleaned).trim();
  const withoutArticle = shouldDropLeadingArticle
    ? rawText.replace(/^(a|an)\s+/i, "")
    : rawText;
  const text = withoutArticle ? smartTitleCase(withoutArticle) : withoutArticle;
  const missing: Array<"text"> = text ? [] : ["text"];
  return {
    type: "todo",
    payload: {
      text,
      day,
      timeblockMins,
      startTime,
      endTime: range?.endTime,
      priority,
      color: defaultBlockColor,
      icon: defaultTaskIcon,
      repeatType: "none",
      repeatWeekdays: [],
      repeatMonthDay: dayKeyToDate(day ?? getDayKey()).getDate(),
    },
    missing,
  };
}

function parseSleepCommand(input: string): PendingAction {
  const durationMins = extractDurationMinutes(input);
  const quality = extractQuality(input) ?? 3;
  const recoveryScore = extractRecovery(input) ?? 3;
  const day = extractDayKey(input) ?? getDefaultSleepDay();
  const missing: Array<"duration" | "quality"> = [];
  const fallbackStart = 23 * 60;
  const fallbackEnd = durationMins ? (fallbackStart + durationMins) % TOTAL_MINUTES : 7 * 60;
  const fallbackDuration = durationMins ?? calculateDuration(fallbackStart, fallbackEnd);
  return {
    type: "sleep",
    payload: {
      durationMins: fallbackDuration,
      quality,
      recoveryScore,
      day,
      startMinutes: fallbackStart,
      endMinutes: fallbackEnd,
    },
    missing,
  };
}

function applyAnswer(pending: PendingAction, answer: string): PendingAction {
  switch (pending.type) {
    case "mood": {
      const mood = extractMoodScore(answer);
      if (!mood) return pending;
      return {
        ...pending,
        payload: { ...pending.payload, mood },
        missing: [],
      };
    }
    case "journal": {
      const text = answer.trim();
      if (!text) return pending;
      return {
        ...pending,
        payload: { ...pending.payload, text },
        missing: [],
      };
    }
    case "todo": {
      const text = answer.trim();
      if (!text) return pending;
      return {
        ...pending,
        payload: { ...pending.payload, text },
        missing: [],
      };
    }
    case "sleep": {
      const nextMissing = pending.missing[0];
      if (nextMissing === "duration") {
        const durationMins = extractDurationMinutes(answer);
        if (!durationMins) return pending;
        const remaining = pending.missing.filter((item) => item !== "duration");
        return {
          ...pending,
          payload: { ...pending.payload, durationMins },
          missing: remaining.length ? remaining : [],
        };
      }
      const quality = extractQuality(answer);
      if (!quality) return pending;
      const remaining = pending.missing.filter((item) => item !== "quality");
      return {
        ...pending,
        payload: { ...pending.payload, quality },
        missing: remaining.length ? remaining : [],
      };
    }
    default:
      return pending;
  }
}

function buildClarifier(action: PendingAction) {
  const next = action.missing[0];
  if (action.type === "mood") {
    return "What mood (1-10) should I log?";
  }
  if (action.type === "journal") {
    return "What should I capture for the journal entry?";
  }
  if (action.type === "todo") {
    return "What task should I add?";
  }
  if (action.type === "sleep") {
    if (next === "duration") {
      return "How long did you sleep (e.g. 7.5h or 7h)?";
    }
    return "What was the sleep quality (1-5)?";
  }
  return "Can you clarify?";
}

function buildPendingSummary(action: PendingAction) {
  switch (action.type) {
    case "mood":
      return `Mood ${action.payload.mood ?? "?"} with tags ${
        action.payload.tags?.join(", ") || "none"
      }.`;
    case "journal":
      return action.payload.text ? `Entry: ${action.payload.text}` : "Waiting for entry text.";
    case "todo":
      if (!action.payload.text) {
        return "Waiting for task description.";
      }
      return `Task: ${action.payload.text}${formatTimeWindow(
        action.payload.startTime,
        action.payload.timeblockMins,
        action.payload.endTime,
      )}${action.payload.priority ? ` • ${priorityLabel(action.payload.priority)}` : ""}`;
    case "sleep":
      return `Duration ${formatDuration(
        action.payload.durationMins ?? DEFAULT_DURATION,
      )}, quality ${action.payload.quality ?? "?"}.`;
    default:
      return "Pending action.";
  }
}

function buildActionSummary(action: PendingAction) {
  switch (action.type) {
    case "mood": {
      const tags = action.payload.tags?.length ? ` • tags: ${action.payload.tags.join(", ")}` : "";
      const note = action.payload.note ? ` • note: ${action.payload.note}` : "";
      return `Logged mood ${action.payload.mood}/10${tags}${note}.`;
    }
    case "journal": {
      const prompt = action.payload.prompt ? ` (${action.payload.prompt})` : "";
      return `Saved journal entry${prompt}: ${action.payload.text ?? ""}`.trim();
    }
    case "todo": {
      const dayLabel = action.payload.day
        ? dayKeyToDate(action.payload.day).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "Today";
      const timeLabel = formatTimeWindow(
        action.payload.startTime,
        action.payload.timeblockMins,
        action.payload.endTime,
      );
      const priority = action.payload.priority ? ` • ${priorityLabel(action.payload.priority)}` : "";
      const repeatLabel =
        action.payload.repeatType && action.payload.repeatType !== "none"
          ? action.payload.repeatType === "weekly"
            ? " • repeats weekly"
            : ` • repeats monthly (${action.payload.repeatMonthDay ?? "?"})`
          : "";
      return `Added todo: ${action.payload.text} • ${dayLabel}${timeLabel}${priority}${repeatLabel}`;
    }
    case "sleep": {
      const durationValue =
        action.payload.startMinutes !== undefined && action.payload.endMinutes !== undefined
          ? calculateDuration(action.payload.startMinutes, action.payload.endMinutes)
          : action.payload.durationMins;
      const duration = durationValue ? formatDuration(durationValue) : "?";
      const quality = action.payload.quality ? ` • quality ${action.payload.quality}/5` : "";
      const recovery = action.payload.recoveryScore ? ` • recovery ${action.payload.recoveryScore}/5` : "";
      const dayLabel = action.payload.day
        ? dayKeyToDate(action.payload.day).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "Today";
      return `Logged sleep: ${duration} • ${dayLabel}${quality}${recovery}.`;
    }
    default:
      return "Action completed.";
  }
}

function extractMoodScore(text: string) {
  const match = text.match(/\b(10|[1-9])\b/);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return undefined;
  return value;
}

function extractNote(text: string) {
  const match = text.match(/notes?[:\-]\s*(.+)$/i);
  return match ? match[1].trim() : undefined;
}

function extractTags(text: string, knownTags: string[]) {
  const lower = text.toLowerCase();
  const inferred = knownTags.filter((tag) => lower.includes(tag));
  const explicit = extractExplicitTags(lower, knownTags);
  return Array.from(new Set([...inferred, ...explicit]));
}

function extractExplicitTags(text: string, knownTags: string[]) {
  const match = text.match(/tags?\s*[:\-]\s*([a-z0-9,\s]+)/i);
  if (!match) return [];
  const rawTags = match[1]
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  if (!rawTags.length) return [];
  const knownSet = new Set(knownTags.map((tag) => tag.toLowerCase()));
  return rawTags.filter((tag) => knownSet.has(tag));
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
  const percent = ((value - min) / (max - min)) * 100;
  const tone =
    value <= 2
      ? { text: "text-rose-300", accent: "#f87171" }
      : value <= 3
        ? { text: "text-amber-300", accent: "#fbbf24" }
        : value <= 4
          ? { text: "text-lime-300", accent: "#84cc16" }
          : { text: "text-emerald-300", accent: "#34d399" };

  return (
    <label className="flex flex-col gap-2 text-sm text-zinc-300">
      <span>
        {label}: <span className={`slider-emphasis ${tone.text}`}>{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded bg-transparent"
        style={{
          accentColor: tone.accent,
          background: `linear-gradient(90deg, ${tone.accent} 0%, ${tone.accent} ${percent}%, #3f3f46 ${percent}%, #3f3f46 100%)`,
        }}
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
    document.body.style.right = "";
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
  }, [startMinutes, endMinutes, onChange, unlockScroll]);

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
  const durationMins = calculateDuration(startMinutes, endMinutes);
  const baseSegments =
    durationMins > DIAL_MINUTES
      ? [{ start: 0, end: DIAL_MINUTES }]
      : buildArcSegments(dialStart, dialEnd);
  const overMinutes = Math.max(0, durationMins - DIAL_MINUTES);
  const overSegments =
    overMinutes > 0
      ? buildArcSegments(dialStart, (dialStart + Math.min(overMinutes, DIAL_MINUTES)) % DIAL_MINUTES)
      : [];
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
                className="sleep-tick"
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
          {baseSegments.map((segment, index) => {
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
          {overSegments.map((segment, index) => {
            const d = describeArc(segment.start, segment.end, CLOCK_RADIUS - 26);
            return (
              <path
                key={`over-${segment.start}-${segment.end}-${index}`}
                d={d}
                stroke="url(#sleepOverGradient)"
                strokeWidth={18}
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
            <linearGradient id="sleepOverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#f97316" />
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

function extractPrompt(text: string) {
  const match = text.match(/\b(morning|priority|free)\b/i);
  if (!match) return undefined;
  return match[1].toLowerCase() as "morning" | "priority" | "free";
}

function extractPriority(text: string): TodoPriority | undefined {
  const lower = text.toLowerCase();
  if (
    lower.includes("priority high") ||
    lower.includes("high priority") ||
    lower.includes("p1") ||
    lower.includes("priority 1")
  ) {
    return 1;
  }
  if (
    lower.includes("priority low") ||
    lower.includes("low priority") ||
    lower.includes("p3") ||
    lower.includes("priority 3")
  ) {
    return 3;
  }
  if (
    lower.includes("priority medium") ||
    lower.includes("medium priority") ||
    lower.includes("p2") ||
    lower.includes("priority 2")
  ) {
    return 2;
  }
  return undefined;
}

function extractDurationMinutes(text: string) {
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    if (Number.isNaN(hours)) return undefined;
    return Math.round(hours * 60);
  }
  const minuteMatch = text.match(/(\d+)\s*m/i);
  if (minuteMatch) {
    const mins = Number(minuteMatch[1]);
    if (Number.isNaN(mins)) return undefined;
    return mins;
  }
  return undefined;
}

function extractQuality(text: string) {
  const match = text.match(/\bquality\s*([1-5])\b/i) ?? text.match(/\bq([1-5])\b/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function extractRecovery(text: string) {
  const match = text.match(/\brecovery\s*([1-5])\b/i);
  if (!match) return undefined;
  return Number(match[1]);
}

function extractDayKey(text: string) {
  const lower = text.toLowerCase();
  const today = new Date();
  if (lower.includes("tomorrow")) {
    const next = new Date(today);
    next.setDate(today.getDate() + 1);
    return getDayKey(next);
  }
  if (lower.includes("yesterday") || lower.includes("last night")) {
    const prev = new Date(today);
    prev.setDate(today.getDate() - 1);
    return getDayKey(prev);
  }
  if (lower.includes("today")) {
    return getDayKey(today);
  }
  return undefined;
}

function extractTime(text: string) {
  const match12 = text.match(
    /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i,
  );
  if (match12) {
    let hours = Number(match12[1]);
    const mins = match12[2] ?? "00";
    const meridiem = match12[3].toLowerCase().replace(/\./g, "");
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${mins}`;
  }
  const match24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (match24) {
    const hours = match24[1].padStart(2, "0");
    return `${hours}:${match24[2]}`;
  }
  return undefined;
}

function extractTimeRange(text: string) {
  const match =
    text.match(/\bfrom\s+([0-9:.\samp]+)\s+to\s+([0-9:.\samp]+)\b/i) ??
    text.match(/\bat\s+([0-9:.\samp]+)\s+to\s+([0-9:.\samp]+)\b/i) ??
    text.match(/\b([0-9:.\samp]+)\s+to\s+([0-9:.\samp]+)\b/i);
  if (!match) return undefined;
  const endMeridiem = extractMeridiem(match[2]);
  const startSource =
    endMeridiem && !extractMeridiem(match[1]) ? `${match[1]} ${endMeridiem}` : match[1];
  const startTime = extractTime(startSource);
  const endTime = extractTime(match[2]);
  if (!startTime || !endTime) return undefined;
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  if (
    [startHours, startMinutes, endHours, endMinutes].some((value) =>
      Number.isNaN(value),
    )
  ) {
    return undefined;
  }
  const startTotal = startHours * 60 + startMinutes;
  const endTotal = endHours * 60 + endMinutes;
  const durationMins = endTotal > startTotal ? endTotal - startTotal : undefined;
  if (!durationMins) return { startTime };
  return { startTime, endTime, durationMins };
}

function formatTimeWindow(startTime?: string, durationMins?: number, endTime?: string) {
  if (!startTime) return "";
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return "";
  const startLabel = formatMinutesLabel(startMinutes);
  if (!durationMins && !endTime) {
    return ` • ${startLabel}`;
  }
  if (endTime) {
    const endMinutes = parseTimeToMinutes(endTime);
    if (endMinutes === null) return ` • ${startLabel}`;
    return ` • ${startLabel}-${formatMinutesLabel(endMinutes)}`;
  }
  const endLabel = formatMinutesLabel(startMinutes + (durationMins ?? 0));
  return ` • ${startLabel}-${endLabel}`;
}

function computeTimeblockFromTimes(start?: string, end?: string) {
  if (!start || !end) return undefined;
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return undefined;
  if (endMinutes <= startMinutes) return undefined;
  return endMinutes - startMinutes;
}

function createSeriesId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `series-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildRepeatDays(args: {
  startDay: DayKey;
  repeatType: RepeatType;
  repeatWeekdays: Day[];
  repeatMonthDay: number;
  horizonDays: number;
}): DayKey[] {
  const startDate = dayKeyToDate(args.startDay);
  const days: DayKey[] = [];
  const weekdaySet =
    args.repeatWeekdays.length > 0
      ? new Set(args.repeatWeekdays)
      : new Set<Day>([startDate.getDay() as Day]);
  for (let offset = 0; offset < args.horizonDays; offset += 1) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + offset);
    const dayKey = getDayKey(current);
    if (args.repeatType === "none") {
      if (offset === 0) {
        days.push(dayKey);
      }
      break;
    }
    if (args.repeatType === "weekly") {
      if (weekdaySet.has(current.getDay() as Day)) {
        days.push(dayKey);
      }
    }
    if (args.repeatType === "monthly") {
      if (current.getDate() === args.repeatMonthDay) {
        days.push(dayKey);
      }
    }
  }
  return Array.from(new Set(days));
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

function describeArc(start: number, end: number, radius = CLOCK_RADIUS) {
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

function getDefaultSleepDay() {
  return getDayKey();
}

function buildDayOptions(rangeDays: number) {
  const options: Array<{ value: DayKey; label: string }> = [];
  for (let offset = -1; offset < rangeDays; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const value = getDayKey(date);
    const label = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    options.push({ value, label });
  }
  return options;
}

type StartTimeOption = {
  value: string;
  label: string;
};

function buildStartTimeOptions(stepMinutes = 15): StartTimeOption[] {
  const totalSteps = (24 * 60) / stepMinutes;
  return Array.from({ length: totalSteps }, (_, index) => {
    const minutes = index * stepMinutes;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const value = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
    return {
      value,
      label: formatMinutesLabel(minutes),
    };
  });
}

function TimePillSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: StartTimeOption[];
  onChange: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLButtonElement>(`button[data-value="${value}"]`);
    if (!active) return;
    const target =
      active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2;
    const nextTop = Math.max(0, Math.min(target, list.scrollHeight - list.clientHeight));
    list.scrollTo({ top: nextTop });
  }, [value]);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const buttons = Array.from(
        list.querySelectorAll("button[data-value]"),
      ) as HTMLButtonElement[];
      if (!buttons.length) return;
      const listRect = list.getBoundingClientRect();
      const listCenter = listRect.top + listRect.height / 2;
      let closestValue: string | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      buttons.forEach((button) => {
        const rect = button.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - listCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestValue = button.getAttribute("data-value");
        }
      });
      const nextValue = closestValue ?? undefined;
      if (nextValue && nextValue !== value) {
        onChange(nextValue);
      }
    }, 120);
  }, [onChange, value]);

  return (
    <div className="flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-emerald-100/70">
      <span className="pl-1">{label}</span>
      <div className="relative rounded-2xl border border-white/10 bg-black/30 p-2">
        <div className="pointer-events-none absolute inset-x-3 top-1/2 h-10 -translate-y-1/2 rounded-full border border-white/10 bg-white/5" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[#0b1121]/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[#0b1121]/90 to-transparent" />
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="hide-scrollbar max-h-40 overflow-y-auto snap-y snap-mandatory py-6"
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                data-value={option.value}
                onClick={() => onChange(option.value)}
                className={`mx-auto block w-full snap-center rounded-full px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.25em] transition ${
                  active ? "text-cyan-200" : "text-white/70 hover:text-white"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function priorityLabel(priority: TodoPriority) {
  switch (priority) {
    case 1:
      return "High priority";
    case 2:
      return "Medium priority";
    default:
      return "Low priority";
  }
}

function stripCommandMetadata(text: string) {
  return text
    .replace(/\b(today|tomorrow|yesterday|last night)\b/gi, "")
    .replace(/\bfrom\s+[0-9:.\samp]+\s+to\s+[0-9:.\samp]+\b/gi, "")
    .replace(/\bat\s+[0-9:.\samp]+\s+to\s+[0-9:.\samp]+\b/gi, "")
    .replace(/\b(at)\s+[0-9:.\samp]+\b/gi, "")
    .replace(/\b(for)\s+\d+(\.\d+)?\s*[hm]\b/gi, "")
    .replace(/\b(priority)\s+(high|medium|low|\d)\b/gi, "")
    .replace(/\b(high|medium|low)\s+priority\b/gi, "")
    .replace(/\bp[1-3]\b/gi, "")
    .replace(/\bquality\s*[1-5]\b/gi, "")
    .replace(/\brecovery\s*[1-5]\b/gi, "")
    .replace(/note[:\-].+$/i, "")
    .replace(/\ba task to\b/gi, "")
    .replace(/\btask to\b/gi, "")
    .trim();
}

function extractMeridiem(text: string) {
  const match = text.match(/\b(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return undefined;
  return match[1].toLowerCase().replace(/\./g, "");
}

function smartTitleCase(text: string) {
  const hasUppercase = /[A-Z]/.test(text);
  if (hasUppercase) return text;
  return text
    .split(" ")
    .map((word, index) => {
      const trimmed = word.trim();
      if (!trimmed) return trimmed;
      if (index !== 0 && ["and", "or", "the", "to", "of", "in", "for"].includes(trimmed)) {
        return trimmed;
      }
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    })
    .join(" ");
}
