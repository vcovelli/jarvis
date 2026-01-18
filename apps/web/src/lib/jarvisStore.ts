"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useSession } from "next-auth/react";

export type DayKey = string; // YYYY-MM-DD

export type MoodTag = string;
export const defaultMoodTags = ["energy", "stress", "sleep", "workout"] as const;
const defaultMoodTagSet = new Set(defaultMoodTags.map((tag) => tag.toLowerCase()));
const MAX_CUSTOM_MOOD_TAGS = 24;
const MAX_MOOD_TAG_LENGTH = 24;

export type MoodLog = {
  id: string;
  ts: number;
  mood: number;
  note?: string;
  tags: MoodTag[];
};

export type JournalPrompt = "morning" | "priority" | "free";

export type JournalEntry = {
  id: string;
  ts: number;
  text: string;
  prompt?: JournalPrompt;
};

export type Timeblock = number;

export type TodoPriority = 1 | 2 | 3;

export type TodoItem = {
  id: string;
  createdTs: number;
  day: DayKey;
  text: string;
  done: boolean;
  priority: TodoPriority;
  timeblockMins?: Timeblock;
  startTime?: string; // HH:MM 24h
  completedTs?: number;
  order?: number;
  color?: string;
  icon?: string;
  seriesId?: string;
};

export type SleepEntry = {
  id: string;
  ts: number;
  day: DayKey;
  durationMins: number;
  quality: number; // 1-5
  startMinutes?: number;
  endMinutes?: number;
  recoveryScore?: number;
  dreams?: string;
  notes?: string;
};

export type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SleepPresetMode = "daily" | "weekdays" | "weekends" | "custom";

export type SleepWindow = {
  lightsOut: string; // "23:00"
  wake: string; // "07:00"
};

export type SleepSchedule = {
  mode: SleepPresetMode;
  daily: SleepWindow;
  weekdays: SleepWindow;
  weekends: SleepWindow;
  custom: Record<Day, SleepWindow>;
  lastEditedDay?: Day;
};

export type OperatingMode = "deep-work" | "execution" | "recovery" | "maintenance" | "push-day";

export type OperatingModeEntry = {
  mode: OperatingMode;
  ts: number;
  suggestedMode?: OperatingMode;
};

export type MustWinEntry = {
  text: string;
  timeBound?: string;
  done: boolean;
  ts: number;
  completedTs?: number;
};

export type DailyReviewReason =
  | "overplanned"
  | "low-energy"
  | "distraction"
  | "external-interruption";

export type DailyReviewEntry = {
  day: DayKey;
  ts: number;
  expected: boolean;
  reason?: DailyReviewReason;
  tomorrow?: string;
};

export type WeeklyReviewEntry = {
  weekKey: string;
  ts: number;
  stop: string;
  doubleDown: string;
  experiment: string;
};

export type JarvisState = {
  mood: Record<DayKey, MoodLog[]>;
  journal: Record<DayKey, JournalEntry[]>;
  todos: Record<DayKey, TodoItem[]>;
  sleep: Record<DayKey, SleepEntry[]>;
  moodTags: string[];
  sleepSchedule: SleepSchedule;
  operatingMode: Record<DayKey, OperatingModeEntry>;
  mustWin: Record<DayKey, MustWinEntry>;
  dailyReview: Record<DayKey, DailyReviewEntry>;
  weeklyReview: Record<string, WeeklyReviewEntry>;
};

const STORAGE_KEY = "jarvis-state-v1";

const defaultWindow: SleepWindow = {
  lightsOut: "23:00",
  wake: "07:00",
};

const defaultSchedule: SleepSchedule = {
  mode: "daily",
  daily: defaultWindow,
  weekdays: defaultWindow,
  weekends: { lightsOut: "00:00", wake: "08:00" },
  custom: createCustomSchedule(defaultWindow),
  lastEditedDay: getDayOfWeek(),
};

const initialState: JarvisState = {
  mood: {},
  journal: {},
  todos: {},
  sleep: {},
  moodTags: [],
  sleepSchedule: defaultSchedule,
  operatingMode: {},
  mustWin: {},
  dailyReview: {},
  weeklyReview: {},
};

type Action =
  | { type: "HYDRATE"; payload: JarvisState }
  | { type: "LOG_MOOD"; payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey } }
  | { type: "ADD_MOOD_TAG"; payload: { tag: string } }
  | { type: "RENAME_MOOD_TAG"; payload: { from: string; to: string } }
  | { type: "DELETE_MOOD_TAG"; payload: { tag: string } }
  | { type: "ADD_JOURNAL"; payload: { text: string; prompt?: JournalPrompt; day?: DayKey } }
  | {
      type: "SET_OPERATING_MODE";
      payload: { day?: DayKey; mode: OperatingMode; suggestedMode?: OperatingMode };
    }
  | {
      type: "SET_MUST_WIN";
      payload: { day?: DayKey; text: string; timeBound?: string };
    }
  | { type: "TOGGLE_MUST_WIN"; payload: { day: DayKey } }
  | {
      type: "LOG_DAILY_REVIEW";
      payload: { day?: DayKey; expected: boolean; reason?: DailyReviewReason; tomorrow?: string };
    }
  | {
      type: "SAVE_WEEKLY_REVIEW";
      payload: { weekKey: string; stop: string; doubleDown: string; experiment: string };
    }
  | {
      type: "UPDATE_JOURNAL";
      payload: { day: DayKey; id: string; updates: Partial<Pick<JournalEntry, "text" | "prompt">> };
    }
  | { type: "DELETE_JOURNAL"; payload: { day: DayKey; id: string } }
  | {
      type: "ADD_TODO";
      payload: {
        text: string;
        priority: TodoPriority;
        timeblockMins?: Timeblock;
        startTime?: string;
        day?: DayKey;
        color?: string;
        icon?: string;
        seriesId?: string;
      };
    }
  | {
      type: "UPDATE_TODO";
      payload: {
        day: DayKey;
        id: string;
        updates: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime" | "color" | "icon">>;
      };
    }
  | { type: "TOGGLE_TODO"; payload: { day: DayKey; id: string } }
  | { type: "UPDATE_TODO_PRIORITY"; payload: { day: DayKey; id: string; priority: TodoPriority } }
  | { type: "REORDER_TODOS"; payload: { day: DayKey; orderedIds: string[] } }
  | { type: "DELETE_TODO"; payload: { day: DayKey; id: string } }
  | {
      type: "LOG_SLEEP";
      payload: {
        durationMins: number;
        quality: number;
        startMinutes?: number;
        endMinutes?: number;
        recoveryScore?: number;
        dreams?: string;
        notes?: string;
        day?: DayKey;
      };
    }
  | {
      type: "UPDATE_SLEEP_ENTRY";
      payload: {
        day: DayKey;
        id: string;
        updates: Partial<
          Pick<
            SleepEntry,
            "durationMins" | "quality" | "startMinutes" | "endMinutes" | "recoveryScore" | "dreams" | "notes"
          >
        >;
      };
    }
  | { type: "DELETE_SLEEP_ENTRY"; payload: { day: DayKey; id: string } }
  | { type: "SET_SLEEP_SCHEDULE"; payload: SleepSchedule }
  | {
      type: "UPDATE_TODO_SCHEDULE";
      payload: {
        day: DayKey;
        id: string;
        startTime?: string;
        timeblockMins?: Timeblock;
      };
    };

function reducer(state: JarvisState, action: Action): JarvisState {
  switch (action.type) {
    case "HYDRATE": {
      return sanitizeState(action.payload);
    }
    case "LOG_MOOD": {
      const day = normalizeDayKey(action.payload.day);
      const entry: MoodLog = {
        id: createId(),
        ts: Date.now(),
        mood: action.payload.mood,
        note: action.payload.note?.trim() || undefined,
        tags: action.payload.tags,
      };
      return {
        ...state,
        mood: insertItem(state.mood, day, entry),
      };
    }
    case "ADD_MOOD_TAG": {
      const tag = normalizeMoodTag(action.payload.tag);
      if (!tag) return state;
      const normalized = tag.toLowerCase();
      if (defaultMoodTagSet.has(normalized)) return state;
      if (state.moodTags.some((existing) => existing.toLowerCase() === normalized)) {
        return state;
      }
      if (state.moodTags.length >= MAX_CUSTOM_MOOD_TAGS) return state;
      return {
        ...state,
        moodTags: [...state.moodTags, tag],
      };
    }
    case "RENAME_MOOD_TAG": {
      const from = normalizeMoodTag(action.payload.from);
      const to = normalizeMoodTag(action.payload.to);
      if (!from || !to) return state;
      const fromIndex = state.moodTags.findIndex((tag) => tag.toLowerCase() === from.toLowerCase());
      if (fromIndex === -1) return state;
      const normalizedTo = to.toLowerCase();
      if (defaultMoodTagSet.has(normalizedTo)) return state;
      if (
        state.moodTags.some((tag, index) => index !== fromIndex && tag.toLowerCase() === normalizedTo)
      ) {
        return state;
      }
      const updatedTags = [...state.moodTags];
      const previousValue = updatedTags[fromIndex];
      updatedTags[fromIndex] = to;
      const updatedMoodLogs = replaceMoodTagInLogs(state.mood, previousValue, to);
      return {
        ...state,
        moodTags: updatedTags,
        mood: updatedMoodLogs,
      };
    }
    case "DELETE_MOOD_TAG": {
      const normalized = normalizeMoodTag(action.payload.tag);
      if (!normalized) return state;
      const filtered = state.moodTags.filter((tag) => tag.toLowerCase() !== normalized.toLowerCase());
      if (filtered.length === state.moodTags.length) return state;
      return {
        ...state,
        moodTags: filtered,
      };
    }
    case "ADD_JOURNAL": {
      const day = normalizeDayKey(action.payload.day);
      const entry: JournalEntry = {
        id: createId(),
        ts: Date.now(),
        text: action.payload.text.trim(),
        prompt: action.payload.prompt,
      };
      return {
        ...state,
        journal: insertItem(state.journal, day, entry),
      };
    }
    case "SET_OPERATING_MODE": {
      const day = normalizeDayKey(action.payload.day);
      const entry: OperatingModeEntry = {
        mode: action.payload.mode,
        ts: Date.now(),
        suggestedMode: action.payload.suggestedMode,
      };
      return {
        ...state,
        operatingMode: {
          ...state.operatingMode,
          [day]: entry,
        },
      };
    }
    case "SET_MUST_WIN": {
      const day = normalizeDayKey(action.payload.day);
      const entry: MustWinEntry = {
        text: action.payload.text.trim(),
        timeBound: action.payload.timeBound?.trim() || undefined,
        done: false,
        ts: Date.now(),
      };
      return {
        ...state,
        mustWin: {
          ...state.mustWin,
          [day]: entry,
        },
      };
    }
    case "TOGGLE_MUST_WIN": {
      const entry = state.mustWin[action.payload.day];
      if (!entry) return state;
      const done = !entry.done;
      return {
        ...state,
        mustWin: {
          ...state.mustWin,
          [action.payload.day]: {
            ...entry,
            done,
            completedTs: done ? Date.now() : undefined,
          },
        },
      };
    }
    case "LOG_DAILY_REVIEW": {
      const day = normalizeDayKey(action.payload.day);
      const entry: DailyReviewEntry = {
        day,
        ts: Date.now(),
        expected: action.payload.expected,
        reason: action.payload.reason,
        tomorrow: action.payload.tomorrow?.trim() || undefined,
      };
      return {
        ...state,
        dailyReview: {
          ...state.dailyReview,
          [day]: entry,
        },
      };
    }
    case "SAVE_WEEKLY_REVIEW": {
      const entry: WeeklyReviewEntry = {
        weekKey: action.payload.weekKey,
        ts: Date.now(),
        stop: action.payload.stop.trim(),
        doubleDown: action.payload.doubleDown.trim(),
        experiment: action.payload.experiment.trim(),
      };
      return {
        ...state,
        weeklyReview: {
          ...state.weeklyReview,
          [action.payload.weekKey]: entry,
        },
      };
    }
    case "UPDATE_JOURNAL": {
      const entries = state.journal[action.payload.day] ?? [];
      return {
        ...state,
        journal: {
          ...state.journal,
          [action.payload.day]: entries.map((entry) =>
            entry.id === action.payload.id ? { ...entry, ...action.payload.updates } : entry,
          ),
        },
      };
    }
    case "DELETE_JOURNAL": {
      const entries = state.journal[action.payload.day] ?? [];
      return {
        ...state,
        journal: {
          ...state.journal,
          [action.payload.day]: entries.filter((entry) => entry.id !== action.payload.id),
        },
      };
    }
    case "ADD_TODO": {
      const day = normalizeDayKey(action.payload.day);
      const todo: TodoItem = {
        id: createId(),
        createdTs: Date.now(),
        day,
        text: action.payload.text.trim(),
        done: false,
        priority: action.payload.priority,
        timeblockMins: action.payload.timeblockMins,
        startTime: action.payload.startTime,
        color: action.payload.color,
        icon: action.payload.icon,
        seriesId: action.payload.seriesId,
      };
      return {
        ...state,
        todos: insertItem(state.todos, day, todo),
      };
    }
    case "TOGGLE_TODO": {
      const todosForDay = state.todos[action.payload.day] ?? [];
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.day]: todosForDay.map((todo) => {
            if (todo.id !== action.payload.id) return todo;
            const done = !todo.done;
            return {
              ...todo,
              done,
              completedTs: done ? Date.now() : undefined,
            };
          }),
        },
      };
    }
    case "UPDATE_TODO": {
      const todosForDay = state.todos[action.payload.day] ?? [];
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.day]: todosForDay.map((todo) =>
            todo.id === action.payload.id ? { ...todo, ...action.payload.updates } : todo,
          ),
        },
      };
    }
    case "UPDATE_TODO_PRIORITY": {
      const todosForDay = state.todos[action.payload.day] ?? [];
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.day]: todosForDay.map((todo) =>
            todo.id === action.payload.id
              ? { ...todo, priority: action.payload.priority }
              : todo,
          ),
        },
      };
    }
    case "DELETE_TODO": {
      const todosForDay = state.todos[action.payload.day] ?? [];
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.day]: todosForDay.filter((todo) => todo.id !== action.payload.id),
        },
      };
    }
    case "REORDER_TODOS": {
      const todosForDay = state.todos[action.payload.day] ?? [];
      if (!todosForDay.length) return state;
      const orderMap = new Map(todosForDay.map((todo) => [todo.id, todo]));
      const reordered = action.payload.orderedIds
        .map((id) => orderMap.get(id))
        .filter((todo): todo is TodoItem => Boolean(todo));
      const leftovers = todosForDay.filter((todo) => !action.payload.orderedIds.includes(todo.id));
      const nextList = [...reordered, ...leftovers].map((todo, index) => ({ ...todo, order: index }));
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.day]: nextList,
        },
      };
    }
    case "LOG_SLEEP": {
      const day = normalizeDayKey(action.payload.day);
      const entry: SleepEntry = {
        id: createId(),
        ts: Date.now(),
        day,
        durationMins: action.payload.durationMins,
        quality: action.payload.quality,
        startMinutes: action.payload.startMinutes,
        endMinutes: action.payload.endMinutes,
        recoveryScore: action.payload.recoveryScore,
        dreams: action.payload.dreams?.trim() || undefined,
        notes: action.payload.notes?.trim() || undefined,
      };
      return {
        ...state,
        sleep: insertItem(state.sleep, day, entry),
      };
    }
    case "UPDATE_SLEEP_ENTRY": {
      const nights = state.sleep[action.payload.day] ?? [];
      return {
        ...state,
        sleep: {
          ...state.sleep,
          [action.payload.day]: nights.map((night) =>
            night.id === action.payload.id ? { ...night, ...action.payload.updates } : night,
          ),
        },
      };
    }
    case "DELETE_SLEEP_ENTRY": {
      const nights = state.sleep[action.payload.day] ?? [];
      return {
        ...state,
        sleep: {
          ...state.sleep,
          [action.payload.day]: nights.filter((night) => night.id !== action.payload.id),
        },
      };
    }
    case "SET_SLEEP_SCHEDULE": {
      return {
        ...state,
        sleepSchedule: sanitizeSleepSchedule(action.payload),
      };
    }
    case "UPDATE_TODO_SCHEDULE": {
      const todosForDay = state.todos[action.payload.day] ?? [];
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.day]: todosForDay.map((todo) => {
            if (todo.id !== action.payload.id) return todo;
            return {
              ...todo,
              startTime: action.payload.startTime ?? todo.startTime,
              timeblockMins: action.payload.timeblockMins ?? todo.timeblockMins,
            };
          }),
        },
      };
    }
    default:
      return state;
  }
}

export function useJarvisState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const { status } = useSession();
  const readyRef = useRef(false);

  useEffect(() => {
    if (!hydrated || status !== "authenticated" || !readyRef.current) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          signal: controller.signal,
        });
      } catch (error) {
        console.warn("Jarvis state save failed", error);
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [state, hydrated, status]);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          dispatch({ type: "HYDRATE", payload: sanitizeState(parsed) });
        }
      } catch (error) {
        console.warn("Jarvis state load failed", error);
      } finally {
        readyRef.current = true;
        setHydrated(true);
      }
      return;
    }

    let isMounted = true;
    fetch("/api/state")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data?.state) {
          dispatch({ type: "HYDRATE", payload: sanitizeState(data.state) });
        }
      })
      .catch((error) => {
        console.warn("Jarvis state load failed", error);
      })
      .finally(() => {
        if (!isMounted) return;
        readyRef.current = true;
        setHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, [status]);

  const logMood = useCallback(
    (payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey }) => {
      dispatch({ type: "LOG_MOOD", payload });
    },
    [],
  );

  const addMoodTagToLibrary = useCallback((payload: { tag: string }) => {
    dispatch({ type: "ADD_MOOD_TAG", payload });
  }, []);

  const renameMoodTag = useCallback((payload: { from: string; to: string }) => {
    dispatch({ type: "RENAME_MOOD_TAG", payload });
  }, []);

  const deleteMoodTagFromLibrary = useCallback((payload: { tag: string }) => {
    dispatch({ type: "DELETE_MOOD_TAG", payload });
  }, []);

  const addJournal = useCallback(
    (payload: { text: string; prompt?: JournalPrompt; day?: DayKey }) => {
      dispatch({ type: "ADD_JOURNAL", payload });
    },
    [],
  );

  const setOperatingMode = useCallback(
    (payload: { day?: DayKey; mode: OperatingMode; suggestedMode?: OperatingMode }) => {
      dispatch({ type: "SET_OPERATING_MODE", payload });
    },
    [],
  );

  const setMustWin = useCallback(
    (payload: { day?: DayKey; text: string; timeBound?: string }) => {
      dispatch({ type: "SET_MUST_WIN", payload });
    },
    [],
  );

  const toggleMustWin = useCallback((payload: { day: DayKey }) => {
    dispatch({ type: "TOGGLE_MUST_WIN", payload });
  }, []);

  const logDailyReview = useCallback(
    (payload: { day?: DayKey; expected: boolean; reason?: DailyReviewReason; tomorrow?: string }) => {
      dispatch({ type: "LOG_DAILY_REVIEW", payload });
    },
    [],
  );

  const saveWeeklyReview = useCallback(
    (payload: { weekKey: string; stop: string; doubleDown: string; experiment: string }) => {
      dispatch({ type: "SAVE_WEEKLY_REVIEW", payload });
    },
    [],
  );

  const updateJournalEntry = useCallback(
    (payload: { day: DayKey; id: string; updates: Partial<Pick<JournalEntry, "text" | "prompt">> }) => {
      dispatch({ type: "UPDATE_JOURNAL", payload });
    },
    [],
  );

  const deleteJournalEntry = useCallback((payload: { day: DayKey; id: string }) => {
    dispatch({ type: "DELETE_JOURNAL", payload });
  }, []);

  const addTodo = useCallback(
    (payload: {
      text: string;
      priority: TodoPriority;
      timeblockMins?: Timeblock;
      startTime?: string;
      day?: DayKey;
      color?: string;
      icon?: string;
      seriesId?: string;
    }) => {
      dispatch({ type: "ADD_TODO", payload });
    },
    [],
  );

  const toggleTodo = useCallback((payload: { day: DayKey; id: string }) => {
    dispatch({ type: "TOGGLE_TODO", payload });
  }, []);

  const updateTodoPriority = useCallback(
    (payload: { day: DayKey; id: string; priority: TodoPriority }) => {
      dispatch({ type: "UPDATE_TODO_PRIORITY", payload });
    },
    [],
  );

  const updateTodo = useCallback(
    (payload: {
      day: DayKey;
      id: string;
      updates: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime" | "color" | "icon">>;
    }) => {
      dispatch({ type: "UPDATE_TODO", payload });
    },
    [],
  );

  const reorderTodos = useCallback((payload: { day: DayKey; orderedIds: string[] }) => {
    dispatch({ type: "REORDER_TODOS", payload });
  }, []);

  const deleteTodo = useCallback((payload: { day: DayKey; id: string }) => {
    dispatch({ type: "DELETE_TODO", payload });
  }, []);

  const updateTodoSchedule = useCallback(
    (payload: { day: DayKey; id: string; startTime?: string; timeblockMins?: Timeblock }) => {
      dispatch({ type: "UPDATE_TODO_SCHEDULE", payload });
    },
    [],
  );

  const logSleep = useCallback(
    (payload: {
      durationMins: number;
      quality: number;
      startMinutes?: number;
      endMinutes?: number;
      recoveryScore?: number;
      dreams?: string;
      notes?: string;
      day?: DayKey;
    }) => {
      dispatch({ type: "LOG_SLEEP", payload });
    },
    [],
  );

  const updateSleepEntry = useCallback(
    (payload: {
      day: DayKey;
      id: string;
      updates: Partial<
        Pick<SleepEntry, "durationMins" | "quality" | "startMinutes" | "endMinutes" | "recoveryScore" | "dreams" | "notes">
      >;
    }) => {
      dispatch({ type: "UPDATE_SLEEP_ENTRY", payload });
    },
    [],
  );

  const deleteSleepEntry = useCallback((payload: { day: DayKey; id: string }) => {
    dispatch({ type: "DELETE_SLEEP_ENTRY", payload });
  }, []);

  const updateSleepSchedule = useCallback((payload: SleepSchedule) => {
    dispatch({ type: "SET_SLEEP_SCHEDULE", payload });
  }, []);

  return {
    state,
    hydrated,
    logMood,
    addMoodTag: addMoodTagToLibrary,
    renameMoodTag,
    deleteMoodTag: deleteMoodTagFromLibrary,
    addJournal,
    setOperatingMode,
    setMustWin,
    toggleMustWin,
    logDailyReview,
    saveWeeklyReview,
    updateJournalEntry,
    deleteJournalEntry,
    addTodo,
    toggleTodo,
    updateTodoPriority,
    updateTodo,
    deleteTodo,
    reorderTodos,
    updateTodoSchedule,
    logSleep,
    updateSleepEntry,
    deleteSleepEntry,
    updateSleepSchedule,
  } as const;
}

export function getDayKey(date = new Date()): DayKey {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractDayKey(value?: string | null): DayKey | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}` as DayKey;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.valueOf())) {
    return getDayKey(parsed);
  }
  return null;
}

export function normalizeDayKey(value?: string | null, fallback?: DayKey): DayKey {
  return extractDayKey(value) ?? fallback ?? getDayKey();
}

export function dayKeyToDate(dayKey: DayKey): Date {
  const normalized = normalizeDayKey(dayKey);
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function insertItem<T>(collection: Record<DayKey, T[]>, day: DayKey, item: T) {
  const existing = collection[day] ?? [];
  return {
    ...collection,
    [day]: [item, ...existing],
  };
}

function sanitizeState(input: unknown): JarvisState {
  if (!input || typeof input !== "object") return initialState;
  const state = input as Partial<JarvisState>;
  return {
    mood: sanitizeRecord(state.mood),
    journal: sanitizeRecord(state.journal),
    todos: sanitizeRecord(state.todos),
    sleep: sanitizeRecord(state.sleep),
    moodTags: sanitizeMoodTagList(state.moodTags),
    sleepSchedule: sanitizeSleepSchedule(state.sleepSchedule),
    operatingMode: sanitizeDayValueRecord(state.operatingMode),
    mustWin: sanitizeDayValueRecord(state.mustWin),
    dailyReview: sanitizeDayValueRecord(state.dailyReview),
    weeklyReview: sanitizeKeyRecord(state.weeklyReview),
  };
}

function sanitizeSleepSchedule(schedule?: SleepSchedule): SleepSchedule {
  if (!schedule) return defaultSchedule;
  const custom: Record<Day, SleepWindow> = { ...createCustomSchedule(defaultWindow) };
  (Object.keys(custom) as Array<`${Day}`>).forEach((dayKey) => {
    const day = Number(dayKey) as Day;
    if (schedule.custom?.[day]) {
      custom[day] = schedule.custom[day];
    }
  });
  return {
    mode: schedule.mode ?? defaultSchedule.mode,
    daily: schedule.daily ?? defaultSchedule.daily,
    weekdays: schedule.weekdays ?? defaultSchedule.weekdays,
    weekends: schedule.weekends ?? defaultSchedule.weekends,
    custom,
    lastEditedDay: schedule.lastEditedDay ?? defaultSchedule.lastEditedDay,
  };
}

function createCustomSchedule(window: SleepWindow) {
  return {
    0: { ...window },
    1: { ...window },
    2: { ...window },
    3: { ...window },
    4: { ...window },
    5: { ...window },
    6: { ...window },
  } as Record<Day, SleepWindow>;
}

function sanitizeRecord<T>(record?: Record<DayKey, T[]>): Record<DayKey, T[]> {
  if (!record || typeof record !== "object") return {};
  return Object.entries(record).reduce((acc, [key, value]) => {
    const normalizedKey = extractDayKey(key) ?? (key as DayKey);
    acc[normalizedKey] = Array.isArray(value) ? value : [];
    return acc;
  }, {} as Record<DayKey, T[]>);
}

function sanitizeMoodTagList(value?: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeMoodTag(entry);
    if (!normalized) continue;
    const lower = normalized.toLowerCase();
    if (defaultMoodTagSet.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    tags.push(normalized);
    if (tags.length >= MAX_CUSTOM_MOOD_TAGS) break;
  }
  return tags;
}

function sanitizeDayValueRecord<T>(record?: Record<DayKey, T>): Record<DayKey, T> {
  if (!record || typeof record !== "object") return {};
  return Object.entries(record).reduce((acc, [key, value]) => {
    const normalizedKey = extractDayKey(key) ?? (key as DayKey);
    if (value) {
      acc[normalizedKey] = value as T;
    }
    return acc;
  }, {} as Record<DayKey, T>);
}

function sanitizeKeyRecord<T>(record?: Record<string, T>): Record<string, T> {
  if (!record || typeof record !== "object") return {};
  return Object.entries(record).reduce((acc, [key, value]) => {
    if (value) {
      acc[key] = value as T;
    }
    return acc;
  }, {} as Record<string, T>);
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getDayOfWeek(date = new Date()): Day {
  return date.getDay() as Day;
}

function normalizeMoodTag(value: string): string {
  if (!value) return "";
  const condensed = value.trim().replace(/\s+/g, " ");
  if (!condensed) return "";
  return condensed.slice(0, MAX_MOOD_TAG_LENGTH);
}

function replaceMoodTagInLogs(
  mood: Record<DayKey, MoodLog[]>,
  from: string,
  to: string,
): Record<DayKey, MoodLog[]> {
  if (from.toLowerCase() === to.toLowerCase()) return mood;
  let changed = false;
  const fromLower = from.toLowerCase();
  const updatedEntries = Object.entries(mood).reduce((acc, [day, logs]) => {
    let dayChanged = false;
    const nextLogs = logs.map((log) => {
      if (!log.tags?.length) return log;
      let tagChanged = false;
      const nextTags = log.tags.map((tag) => {
        if (tag.toLowerCase() === fromLower) {
          tagChanged = true;
          return to;
        }
        return tag;
      });
      if (tagChanged) {
        dayChanged = true;
        changed = true;
        return { ...log, tags: nextTags };
      }
      return log;
    });
    acc[day as DayKey] = dayChanged ? nextLogs : logs;
    return acc;
  }, {} as Record<DayKey, MoodLog[]>);
  return changed ? updatedEntries : mood;
}
