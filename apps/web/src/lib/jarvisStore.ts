"use client";

import { useCallback, useEffect, useReducer, useState } from "react";

export type DayKey = string; // YYYY-MM-DD

export type MoodTag = "energy" | "stress" | "sleep" | "workout";

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

export type JarvisState = {
  mood: Record<DayKey, MoodLog[]>;
  journal: Record<DayKey, JournalEntry[]>;
  todos: Record<DayKey, TodoItem[]>;
  sleep: Record<DayKey, SleepEntry[]>;
  sleepSchedule: SleepSchedule;
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
  sleepSchedule: defaultSchedule,
};

type Action =
  | { type: "HYDRATE"; payload: JarvisState }
  | { type: "LOG_MOOD"; payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey } }
  | { type: "ADD_JOURNAL"; payload: { text: string; prompt?: JournalPrompt; day?: DayKey } }
  | {
      type: "ADD_TODO";
      payload: {
        text: string;
        priority: TodoPriority;
        timeblockMins?: Timeblock;
        startTime?: string;
        day?: DayKey;
      };
    }
  | {
      type: "UPDATE_TODO";
      payload: {
        day: DayKey;
        id: string;
        updates: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime">>;
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
      const day = action.payload.day ?? getDayKey();
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
    case "ADD_JOURNAL": {
      const day = action.payload.day ?? getDayKey();
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
    case "ADD_TODO": {
      const day = action.payload.day ?? getDayKey();
      const todo: TodoItem = {
        id: createId(),
        createdTs: Date.now(),
        day,
        text: action.payload.text.trim(),
        done: false,
        priority: action.payload.priority,
        timeblockMins: action.payload.timeblockMins,
        startTime: action.payload.startTime,
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
      const day = action.payload.day ?? getDayKey();
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

  useEffect(() => {
    if (hydrated) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.warn("Jarvis state save failed", error);
      }
    }
  }, [state, hydrated]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        dispatch({ type: "HYDRATE", payload: sanitizeState(parsed) });
      }
    } catch (error) {
      console.warn("Jarvis state load failed", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  const logMood = useCallback(
    (payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey }) => {
      dispatch({ type: "LOG_MOOD", payload });
    },
    [],
  );

  const addJournal = useCallback(
    (payload: { text: string; prompt?: JournalPrompt; day?: DayKey }) => {
      dispatch({ type: "ADD_JOURNAL", payload });
    },
    [],
  );

  const addTodo = useCallback(
    (payload: {
      text: string;
      priority: TodoPriority;
      timeblockMins?: Timeblock;
      startTime?: string;
      day?: DayKey;
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
      updates: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime">>;
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

  const updateSleepSchedule = useCallback((payload: SleepSchedule) => {
    dispatch({ type: "SET_SLEEP_SCHEDULE", payload });
  }, []);

  return {
    state,
    hydrated,
    logMood,
    addJournal,
    addTodo,
    toggleTodo,
    updateTodoPriority,
    updateTodo,
    deleteTodo,
    reorderTodos,
    updateTodoSchedule,
    logSleep,
    updateSleepSchedule,
  } as const;
}

export function getDayKey(date = new Date()): DayKey {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    sleepSchedule: sanitizeSleepSchedule(state.sleepSchedule),
  };
}

function sanitizeSleepSchedule(schedule?: SleepSchedule): SleepSchedule {
  if (!schedule) return defaultSchedule;
  const custom: Record<Day, SleepWindow> = { ...createCustomSchedule(defaultWindow) };
  (Object.keys(custom) as Day[]).forEach((day) => {
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
    acc[key] = Array.isArray(value) ? value : [];
    return acc;
  }, {} as Record<DayKey, T[]>);
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

export function dayKeyToDate(dayKey: DayKey): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return new Date(dayKey);
  }
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}
