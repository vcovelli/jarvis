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

export type Timeblock = 15 | 30 | 60 | 90 | 120;

export type TodoPriority = 1 | 2 | 3;

export type TodoItem = {
  id: string;
  createdTs: number;
  day: DayKey;
  text: string;
  done: boolean;
  priority: TodoPriority;
  timeblockMins?: Timeblock;
  completedTs?: number;
};

export type SleepEntry = {
  id: string;
  ts: number;
  day: DayKey;
  durationMins: number;
  quality: number; // 1-5
  dreams?: string;
  notes?: string;
};

export type JarvisState = {
  mood: Record<DayKey, MoodLog[]>;
  journal: Record<DayKey, JournalEntry[]>;
  todos: Record<DayKey, TodoItem[]>;
  sleep: Record<DayKey, SleepEntry[]>;
};

const STORAGE_KEY = "jarvis-state-v1";

const initialState: JarvisState = {
  mood: {},
  journal: {},
  todos: {},
  sleep: {},
};

type Action =
  | { type: "HYDRATE"; payload: JarvisState }
  | { type: "LOG_MOOD"; payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey } }
  | { type: "ADD_JOURNAL"; payload: { text: string; prompt?: JournalPrompt; day?: DayKey } }
  | {
      type: "ADD_TODO";
      payload: { text: string; priority: TodoPriority; timeblockMins?: Timeblock; day?: DayKey };
    }
  | { type: "TOGGLE_TODO"; payload: { day: DayKey; id: string } }
  | { type: "UPDATE_TODO_PRIORITY"; payload: { day: DayKey; id: string; priority: TodoPriority } }
  | {
      type: "LOG_SLEEP";
      payload: {
        durationMins: number;
        quality: number;
        dreams?: string;
        notes?: string;
        day?: DayKey;
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
    case "LOG_SLEEP": {
      const day = action.payload.day ?? getDayKey();
      const entry: SleepEntry = {
        id: createId(),
        ts: Date.now(),
        day,
        durationMins: action.payload.durationMins,
        quality: action.payload.quality,
        dreams: action.payload.dreams?.trim() || undefined,
        notes: action.payload.notes?.trim() || undefined,
      };
      return {
        ...state,
        sleep: insertItem(state.sleep, day, entry),
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
    (payload: { text: string; priority: TodoPriority; timeblockMins?: Timeblock; day?: DayKey }) => {
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

  const logSleep = useCallback(
    (payload: {
      durationMins: number;
      quality: number;
      dreams?: string;
      notes?: string;
      day?: DayKey;
    }) => {
      dispatch({ type: "LOG_SLEEP", payload });
    },
    [],
  );

  return {
    state,
    hydrated,
    logMood,
    addJournal,
    addTodo,
    toggleTodo,
    updateTodoPriority,
    logSleep,
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
  };
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
