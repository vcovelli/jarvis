"use client";

import {
  createElement,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import { createETagFromJson } from "@/lib/stateHash";

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

export type ObjectiveStatus = "active" | "paused" | "done";

export type ObjectiveProject = {
  id: string;
  title: string;
  milestone?: string;
  done: boolean;
  ts: number;
  completedTs?: number;
};

export type Objective = {
  id: string;
  title: string;
  area?: string;
  target?: string;
  nextAction?: string;
  status: ObjectiveStatus;
  ts: number;
  updatedTs: number;
  projects: ObjectiveProject[];
};

export type HomelabActionType =
  | "refresh-snapshot"
  | "service-health-check"
  | "service-restart-review"
  | "docs-review";

export type HomelabActionStatus = "recorded" | "completed" | "blocked";

export type HomelabActionRisk = "low" | "guarded";

export type HomelabActionLog = {
  id: string;
  ts: number;
  action: HomelabActionType;
  label: string;
  target?: string;
  status: HomelabActionStatus;
  risk: HomelabActionRisk;
  note?: string;
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
  objectives: Objective[];
  homelabActions: HomelabActionLog[];
};

const STORAGE_KEY = "jarvis-state-v1";
const STORAGE_META_KEY = "jarvis-state-meta-v1";
const MAX_HOMELAB_ACTIONS = 100;

export type LocalSaveStatus = "loading" | "saved" | "error";
export type RemoteSaveStatus = "idle" | "pending" | "saving" | "saved" | "offline" | "error";

export type StateSyncStatus = {
  local: LocalSaveStatus;
  remote: RemoteSaveStatus;
  lastLocalSavedAt?: number;
  lastRemoteSavedAt?: number;
  error?: string;
};

type StoredMeta = {
  etag?: string;
  savedAt?: number;
  pendingRemoteSave?: boolean;
  remoteSyncedAt?: number;
  remoteUpdatedAt?: number;
};

function buildStorageKey(userId?: string) {
  return `${STORAGE_KEY}:${userId ?? "guest"}`;
}

function buildMetaKey(userId?: string) {
  return `${STORAGE_META_KEY}:${userId ?? "guest"}`;
}

function buildStorageContext(status: string, userId?: string | null) {
  const isAuthenticated = status === "authenticated" && Boolean(userId);
  const resolvedUserId = isAuthenticated ? userId ?? undefined : undefined;
  return {
    isAuthenticated,
    userId: resolvedUserId,
    userKey: isAuthenticated ? resolvedUserId ?? "user" : "guest",
    storageKey: buildStorageKey(resolvedUserId),
    metaKey: buildMetaKey(resolvedUserId),
  };
}

function readStoredState(key: string): JarvisState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return sanitizeState(parsed);
  } catch (error) {
    console.warn("Jarvis state load failed", error);
    return null;
  }
}

function writeStoredState(key: string, stateJson: string) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, stateJson);
    return true;
  } catch (error) {
    console.warn("Jarvis state cache save failed", error);
    return false;
  }
}

function readStoredMeta(key: string): StoredMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as StoredMeta;
  } catch (error) {
    console.warn("Jarvis state meta load failed", error);
    return null;
  }
}

function writeStoredMeta(key: string, meta: StoredMeta) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(meta));
    return true;
  } catch (error) {
    console.warn("Jarvis state meta save failed", error);
    return false;
  }
}

function canUseNetwork() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown persistence error";
}

type RemoteSaveResult = {
  etag?: string;
  updatedAt?: number;
};

async function saveStateToServer(
  state: JarvisState,
  options: { signal?: AbortSignal; keepalive?: boolean } = {},
): Promise<RemoteSaveResult> {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
    signal: options.signal,
    keepalive: options.keepalive,
  });
  if (!response.ok) {
    throw new Error(`State save failed with ${response.status}`);
  }
  const data = await response.json().catch(() => null);
  return {
    etag: response.headers.get("etag") ?? undefined,
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : undefined,
  };
}

function queueStateSaveBeacon(state: JarvisState) {
  const body = JSON.stringify({ state });
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const payload = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/state", payload)) return true;
    } catch (error) {
      console.warn("Jarvis state beacon save failed", error);
    }
  }

  if (typeof fetch === "undefined") return false;
  try {
    void fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
    return true;
  } catch (error) {
    console.warn("Jarvis state keepalive save failed", error);
    return false;
  }
}

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
  objectives: [],
  homelabActions: [],
};

type Action =
  | { type: "HYDRATE"; payload: JarvisState }
  | { type: "LOG_MOOD"; payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey } }
  | {
      type: "UPDATE_MOOD";
      payload: {
        day: DayKey;
        id: string;
        updates: Partial<Pick<MoodLog, "mood" | "note" | "tags">>;
      };
    }
  | { type: "DELETE_MOOD"; payload: { day: DayKey; id: string } }
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
      type: "ADD_OBJECTIVE";
      payload: { title: string; area?: string; target?: string; nextAction?: string };
    }
  | {
      type: "UPDATE_OBJECTIVE";
      payload: {
        id: string;
        updates: Partial<Pick<Objective, "title" | "area" | "target" | "nextAction" | "status">>;
      };
    }
  | { type: "DELETE_OBJECTIVE"; payload: { id: string } }
  | {
      type: "ADD_OBJECTIVE_PROJECT";
      payload: { objectiveId: string; title: string; milestone?: string };
    }
  | {
      type: "TOGGLE_OBJECTIVE_PROJECT";
      payload: { objectiveId: string; projectId: string };
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
  | {
      type: "MOVE_TODO";
      payload: {
        fromDay: DayKey;
        id: string;
        toDay: DayKey;
        updates?: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime" | "color" | "icon">>;
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
    }
  | {
      type: "RECORD_HOMELAB_ACTION";
      payload: {
        action: HomelabActionType;
        label: string;
        target?: string;
        status: HomelabActionStatus;
        risk: HomelabActionRisk;
        note?: string;
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
    case "UPDATE_MOOD": {
      const logs = state.mood[action.payload.day] ?? [];
      return {
        ...state,
        mood: {
          ...state.mood,
          [action.payload.day]: logs.map((log) =>
            log.id === action.payload.id ? { ...log, ...action.payload.updates } : log,
          ),
        },
      };
    }
    case "DELETE_MOOD": {
      const logs = state.mood[action.payload.day] ?? [];
      return {
        ...state,
        mood: {
          ...state.mood,
          [action.payload.day]: logs.filter((log) => log.id !== action.payload.id),
        },
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
    case "ADD_OBJECTIVE": {
      const now = Date.now();
      const objective: Objective = {
        id: createId(),
        title: action.payload.title.trim(),
        area: action.payload.area?.trim() || undefined,
        target: action.payload.target?.trim() || undefined,
        nextAction: action.payload.nextAction?.trim() || undefined,
        status: "active",
        ts: now,
        updatedTs: now,
        projects: [],
      };
      return {
        ...state,
        objectives: [objective, ...state.objectives],
      };
    }
    case "UPDATE_OBJECTIVE": {
      const now = Date.now();
      return {
        ...state,
        objectives: state.objectives.map((objective) =>
          objective.id === action.payload.id
            ? {
                ...objective,
                ...sanitizeObjectiveUpdates(action.payload.updates),
                updatedTs: now,
              }
            : objective,
        ),
      };
    }
    case "DELETE_OBJECTIVE": {
      return {
        ...state,
        objectives: state.objectives.filter((objective) => objective.id !== action.payload.id),
      };
    }
    case "ADD_OBJECTIVE_PROJECT": {
      const now = Date.now();
      const project: ObjectiveProject = {
        id: createId(),
        title: action.payload.title.trim(),
        milestone: action.payload.milestone?.trim() || undefined,
        done: false,
        ts: now,
      };
      return {
        ...state,
        objectives: state.objectives.map((objective) =>
          objective.id === action.payload.objectiveId
            ? {
                ...objective,
                updatedTs: now,
                projects: [project, ...objective.projects],
              }
            : objective,
        ),
      };
    }
    case "TOGGLE_OBJECTIVE_PROJECT": {
      const now = Date.now();
      return {
        ...state,
        objectives: state.objectives.map((objective) => {
          if (objective.id !== action.payload.objectiveId) return objective;
          return {
            ...objective,
            updatedTs: now,
            projects: objective.projects.map((project) => {
              if (project.id !== action.payload.projectId) return project;
              const done = !project.done;
              return {
                ...project,
                done,
                completedTs: done ? now : undefined,
              };
            }),
          };
        }),
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
    case "MOVE_TODO": {
      const sourceTodos = state.todos[action.payload.fromDay] ?? [];
      const todo = sourceTodos.find((item) => item.id === action.payload.id);
      if (!todo) return state;
      const toDay = normalizeDayKey(action.payload.toDay);
      const moved: TodoItem = {
        ...todo,
        ...action.payload.updates,
        day: toDay,
      };
      return {
        ...state,
        todos: {
          ...state.todos,
          [action.payload.fromDay]: sourceTodos.filter((item) => item.id !== action.payload.id),
          [toDay]: [moved, ...(state.todos[toDay] ?? [])],
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
    case "RECORD_HOMELAB_ACTION": {
      const entry: HomelabActionLog = {
        id: createId(),
        ts: Date.now(),
        action: sanitizeHomelabActionType(action.payload.action),
        label: action.payload.label.trim() || "Homelab action",
        target: cleanOptionalString(action.payload.target),
        status: sanitizeHomelabActionStatus(action.payload.status),
        risk: sanitizeHomelabActionRisk(action.payload.risk),
        note: cleanOptionalString(action.payload.note),
      };
      return {
        ...state,
        homelabActions: [entry, ...state.homelabActions].slice(0, MAX_HOMELAB_ACTIONS),
      };
    }
    default:
      return state;
  }
}

function useJarvisStoreInternal() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const { status, data: session } = useSession();
  const readyRef = useRef(false);
  const lastUserRef = useRef<string | null>(null);
  const lastLocalSaveRef = useRef<string | null>(null);

  const [syncStatus, setSyncStatus] = useState<StateSyncStatus>({
    local: "loading",
    remote: "idle",
  });
  const [networkRetryTick, setNetworkRetryTick] = useState(0);
  const stateRef = useRef(state);
  const lastRemoteSaveRef = useRef<string | null>(null);
  const scheduleSyncStatus = useCallback(
    (updater: (current: StateSyncStatus) => StateSyncStatus) => {
      Promise.resolve().then(() => setSyncStatus(updater));
    },
    [],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistLocalSnapshot = useCallback(
    (
      nextState: JarvisState,
      options: {
        etag?: string;
        pendingRemoteSave?: boolean;
        remoteSyncedAt?: number;
        remoteUpdatedAt?: number;
      } = {},
    ) => {
      const context = buildStorageContext(status, session?.user?.id);
      const stateJson = JSON.stringify(nextState);
      const savedAt = Date.now();
      const existingMeta = readStoredMeta(context.metaKey);
      const pendingRemoteSave = context.isAuthenticated
        ? options.pendingRemoteSave ?? true
        : false;
      const meta: StoredMeta = {
        ...(existingMeta ?? {}),
        etag: options.etag ?? createETagFromJson(stateJson),
        savedAt,
        pendingRemoteSave,
        remoteSyncedAt: options.remoteSyncedAt ?? existingMeta?.remoteSyncedAt,
        remoteUpdatedAt: options.remoteUpdatedAt ?? existingMeta?.remoteUpdatedAt,
      };
      const stateSaved = writeStoredState(context.storageKey, stateJson);
      const metaSaved = writeStoredMeta(context.metaKey, meta);

      if (stateSaved && metaSaved) {
        lastLocalSaveRef.current = `${context.storageKey}:${stateJson}`;
        scheduleSyncStatus((current) => ({
          ...current,
          local: "saved",
          remote: context.isAuthenticated
            ? pendingRemoteSave
              ? canUseNetwork()
                ? "pending"
                : "offline"
              : current.remote
            : "idle",
          lastLocalSavedAt: savedAt,
          error: undefined,
        }));
      } else {
        scheduleSyncStatus((current) => ({
          ...current,
          local: "error",
          error: "Local browser storage rejected the latest state.",
        }));
      }

      return { context, stateJson, savedAt, pendingRemoteSave };
    },
    [scheduleSyncStatus, session?.user?.id, status],
  );

  useEffect(() => {
    function handleOnline() {
      setNetworkRetryTick((value) => value + 1);
      setSyncStatus((current) =>
        current.remote === "offline" || current.remote === "error"
          ? { ...current, remote: "pending", error: undefined }
          : current,
      );
    }

    function handleOffline() {
      setSyncStatus((current) =>
        current.remote === "pending" || current.remote === "saving" || current.remote === "error"
          ? { ...current, remote: "offline" }
          : current,
      );
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    readyRef.current = false;
    scheduleSyncStatus((current) => ({ ...current, local: "loading", remote: "idle" }));
    let isMounted = true;
    const markHydrated = (value: boolean) => {
      Promise.resolve().then(() => {
        if (!isMounted) return;
        setHydrated(value);
      });
    };
    markHydrated(false);

    const context = buildStorageContext(status, session?.user?.id);
    const shouldReset = lastUserRef.current !== context.userKey;
    lastUserRef.current = context.userKey;

    const cachedState = readStoredState(context.storageKey);
    const cachedMeta = readStoredMeta(context.metaKey);
    if (cachedState) {
      dispatch({ type: "HYDRATE", payload: cachedState });
      scheduleSyncStatus(() => ({
        local: "saved",
        remote: context.isAuthenticated
          ? cachedMeta?.pendingRemoteSave
            ? canUseNetwork()
              ? "pending"
              : "offline"
            : "saved"
          : "idle",
        lastLocalSavedAt: cachedMeta?.savedAt,
        lastRemoteSavedAt: cachedMeta?.remoteSyncedAt,
      }));
    } else if (shouldReset) {
      dispatch({ type: "HYDRATE", payload: initialState });
    }

    if (!context.isAuthenticated || !canUseNetwork()) {
      readyRef.current = true;
      markHydrated(true);
      if (context.isAuthenticated) {
        scheduleSyncStatus((current) => ({ ...current, remote: "offline" }));
      }
      return () => {
        isMounted = false;
      };
    }

    const headers: HeadersInit = cachedMeta?.etag ? { "If-None-Match": cachedMeta.etag } : {};
    fetch("/api/state", { headers })
      .then(async (response) => {
        if (response.status === 304) {
          return { status: 304 as const, etag: cachedMeta?.etag ?? undefined };
        }
        if (!response.ok) {
          return { status: response.status };
        }
        const data = await response.json().catch(() => null);
        const etag = response.headers.get("etag") ?? undefined;
        const updatedAt = typeof data?.updatedAt === "number" ? data.updatedAt : undefined;
        return { status: 200 as const, state: data?.state ?? null, etag, updatedAt };
      })
      .then((result) => {
        if (!isMounted || !result) return;
        if (result.status === 304) {
          const syncedAt = Date.now();
          if (cachedState) {
            const stateJson = JSON.stringify(cachedState);
            const signature = `${context.storageKey}:${stateJson}`;
            lastLocalSaveRef.current = signature;
            lastRemoteSaveRef.current = signature;
          }
          writeStoredMeta(context.metaKey, {
            ...(cachedMeta ?? {}),
            etag: result.etag ?? cachedMeta?.etag,
            savedAt: cachedMeta?.savedAt ?? syncedAt,
            pendingRemoteSave: false,
            remoteSyncedAt: syncedAt,
            remoteUpdatedAt: cachedMeta?.remoteUpdatedAt,
          });
          setSyncStatus((current) => ({
            ...current,
            local: cachedState ? "saved" : current.local,
            remote: "saved",
            lastRemoteSavedAt: syncedAt,
            error: undefined,
          }));
          return;
        }

        if (result.status === 200 && result.state) {
          const serverState = sanitizeState(result.state);
          const serverStateJson = JSON.stringify(serverState);
          const serverSignature = `${context.storageKey}:${serverStateJson}`;
          const serverMatchesCache = Boolean(
            result.etag && cachedMeta?.etag && result.etag === cachedMeta.etag,
          );
          const pendingCacheIsNewerThanServer = Boolean(
            cachedState &&
              cachedMeta?.pendingRemoteSave &&
              cachedMeta.savedAt &&
              (!result.updatedAt || cachedMeta.savedAt > result.updatedAt),
          );
          const keepPendingCache = Boolean(
            cachedState &&
              cachedMeta?.pendingRemoteSave &&
              !serverMatchesCache &&
              pendingCacheIsNewerThanServer,
          );

          if (!serverMatchesCache && !keepPendingCache) {
            dispatch({ type: "HYDRATE", payload: serverState });
          }

          if (!keepPendingCache) {
            const syncedAt = Date.now();
            const localEtag = createETagFromJson(serverStateJson);
            writeStoredState(context.storageKey, serverStateJson);
            writeStoredMeta(context.metaKey, {
              etag: localEtag,
              savedAt: syncedAt,
              pendingRemoteSave: result.etag ? result.etag !== localEtag : false,
              remoteSyncedAt: syncedAt,
              remoteUpdatedAt: result.updatedAt,
            });
            lastLocalSaveRef.current = serverSignature;
            if (!result.etag || result.etag === localEtag) {
              lastRemoteSaveRef.current = serverSignature;
            }
            setSyncStatus({
              local: "saved",
              remote: !result.etag || result.etag === localEtag ? "saved" : "pending",
              lastLocalSavedAt: syncedAt,
              lastRemoteSavedAt: syncedAt,
            });
          } else {
            setSyncStatus((current) => ({
              ...current,
              local: "saved",
              remote: canUseNetwork() ? "pending" : "offline",
              error: undefined,
            }));
          }
        } else if (result.etag) {
          const syncedAt = Date.now();
          writeStoredMeta(context.metaKey, {
            ...(cachedMeta ?? {}),
            etag: result.etag,
            savedAt: cachedMeta?.savedAt ?? syncedAt,
            pendingRemoteSave: false,
            remoteSyncedAt: syncedAt,
            remoteUpdatedAt: cachedMeta?.remoteUpdatedAt,
          });
          setSyncStatus((current) => ({
            ...current,
            remote: "saved",
            lastRemoteSavedAt: syncedAt,
            error: undefined,
          }));
        }
      })
      .catch((error) => {
        console.warn("Jarvis state load failed", error);
        setSyncStatus((current) => ({
          ...current,
          remote: canUseNetwork() ? "error" : "offline",
          error: getErrorMessage(error),
        }));
      })
      .finally(() => {
        if (!isMounted) return;
        readyRef.current = true;
        markHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, [scheduleSyncStatus, status, session?.user?.id]);

  useEffect(() => {
    if (!hydrated || !readyRef.current) return;
    const context = buildStorageContext(status, session?.user?.id);
    if (lastUserRef.current !== context.userKey) return;
    const stateJson = JSON.stringify(state);
    const saveSignature = `${context.storageKey}:${stateJson}`;
    if (lastLocalSaveRef.current === saveSignature) return;
    const needsRemoteSave = context.isAuthenticated && lastRemoteSaveRef.current !== saveSignature;
    persistLocalSnapshot(state, { pendingRemoteSave: needsRemoteSave });
  }, [state, hydrated, status, session?.user?.id, persistLocalSnapshot]);

  useEffect(() => {
    if (!hydrated || !readyRef.current) return;
    const context = buildStorageContext(status, session?.user?.id);
    if (lastUserRef.current !== context.userKey) return;
    if (!context.isAuthenticated) return;

    const stateJson = JSON.stringify(state);
    const saveSignature = `${context.storageKey}:${stateJson}`;
    if (lastRemoteSaveRef.current === saveSignature) return;

    if (!canUseNetwork()) {
      scheduleSyncStatus((current) => ({ ...current, remote: "offline" }));
      return;
    }

    const controller = new AbortController();
    scheduleSyncStatus((current) => ({ ...current, remote: "saving", error: undefined }));
    void saveStateToServer(state, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const syncedAt = Date.now();
        const meta = readStoredMeta(context.metaKey);
        writeStoredMeta(context.metaKey, {
          ...(meta ?? {}),
          etag: result.etag ?? createETagFromJson(stateJson),
          savedAt: meta?.savedAt ?? syncedAt,
          pendingRemoteSave: false,
          remoteSyncedAt: syncedAt,
          remoteUpdatedAt: result.updatedAt ?? meta?.remoteUpdatedAt,
        });
        lastRemoteSaveRef.current = saveSignature;
        setSyncStatus((current) => ({
          ...current,
          remote: "saved",
          lastRemoteSavedAt: syncedAt,
          error: undefined,
        }));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("Jarvis state save failed", error);
        const meta = readStoredMeta(context.metaKey);
        writeStoredMeta(context.metaKey, {
          ...(meta ?? {}),
          etag: meta?.etag ?? createETagFromJson(stateJson),
          savedAt: meta?.savedAt ?? Date.now(),
          pendingRemoteSave: true,
          remoteSyncedAt: meta?.remoteSyncedAt,
          remoteUpdatedAt: meta?.remoteUpdatedAt,
        });
        setSyncStatus((current) => ({
          ...current,
          remote: canUseNetwork() ? "error" : "offline",
          error: getErrorMessage(error),
        }));
      });
    return () => {
      controller.abort();
    };
  }, [state, hydrated, scheduleSyncStatus, status, session?.user?.id, networkRetryTick]);

  useEffect(() => {
    if (!hydrated || !readyRef.current) return;

    function flushPendingRemoteSave() {
      const context = buildStorageContext(status, session?.user?.id);
      if (lastUserRef.current !== context.userKey) return;

      const stateJson = JSON.stringify(stateRef.current);
      const saveSignature = `${context.storageKey}:${stateJson}`;
      const meta = readStoredMeta(context.metaKey);
      const needsRemoteSave = Boolean(
        context.isAuthenticated &&
          (meta?.pendingRemoteSave || lastRemoteSaveRef.current !== saveSignature),
      );
      persistLocalSnapshot(stateRef.current, { pendingRemoteSave: needsRemoteSave });
      if (!needsRemoteSave || !canUseNetwork()) return;

      if (queueStateSaveBeacon(stateRef.current)) {
        setSyncStatus((current) => ({ ...current, remote: "saving", error: undefined }));
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushPendingRemoteSave();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushPendingRemoteSave);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushPendingRemoteSave);
    };
  }, [hydrated, persistLocalSnapshot, session?.user?.id, status]);

  const logMood = useCallback(
    (payload: { mood: number; note?: string; tags: MoodTag[]; day?: DayKey }) => {
      dispatch({ type: "LOG_MOOD", payload });
    },
    [],
  );

  const updateMood = useCallback(
    (payload: { day: DayKey; id: string; updates: Partial<Pick<MoodLog, "mood" | "note" | "tags">> }) => {
      dispatch({ type: "UPDATE_MOOD", payload });
    },
    [],
  );

  const deleteMood = useCallback((payload: { day: DayKey; id: string }) => {
    dispatch({ type: "DELETE_MOOD", payload });
  }, []);

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

  const addObjective = useCallback(
    (payload: { title: string; area?: string; target?: string; nextAction?: string }) => {
      dispatch({ type: "ADD_OBJECTIVE", payload });
    },
    [],
  );

  const updateObjective = useCallback(
    (payload: {
      id: string;
      updates: Partial<Pick<Objective, "title" | "area" | "target" | "nextAction" | "status">>;
    }) => {
      dispatch({ type: "UPDATE_OBJECTIVE", payload });
    },
    [],
  );

  const deleteObjective = useCallback((payload: { id: string }) => {
    dispatch({ type: "DELETE_OBJECTIVE", payload });
  }, []);

  const addObjectiveProject = useCallback(
    (payload: { objectiveId: string; title: string; milestone?: string }) => {
      dispatch({ type: "ADD_OBJECTIVE_PROJECT", payload });
    },
    [],
  );

  const toggleObjectiveProject = useCallback(
    (payload: { objectiveId: string; projectId: string }) => {
      dispatch({ type: "TOGGLE_OBJECTIVE_PROJECT", payload });
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

  const moveTodo = useCallback(
    (payload: {
      fromDay: DayKey;
      id: string;
      toDay: DayKey;
      updates?: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime" | "color" | "icon">>;
    }) => {
      dispatch({ type: "MOVE_TODO", payload });
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

  const recordHomelabAction = useCallback(
    (payload: {
      action: HomelabActionType;
      label: string;
      target?: string;
      status: HomelabActionStatus;
      risk: HomelabActionRisk;
      note?: string;
    }) => {
      dispatch({ type: "RECORD_HOMELAB_ACTION", payload });
    },
    [],
  );

  return {
    state,
    hydrated,
    syncStatus,
    logMood,
    updateMood,
    deleteMood,
    addMoodTag: addMoodTagToLibrary,
    renameMoodTag,
    deleteMoodTag: deleteMoodTagFromLibrary,
    addJournal,
    setOperatingMode,
    setMustWin,
    toggleMustWin,
    logDailyReview,
    saveWeeklyReview,
    addObjective,
    updateObjective,
    deleteObjective,
    addObjectiveProject,
    toggleObjectiveProject,
    updateJournalEntry,
    deleteJournalEntry,
    addTodo,
    toggleTodo,
    updateTodoPriority,
    updateTodo,
    moveTodo,
    deleteTodo,
    reorderTodos,
    updateTodoSchedule,
    logSleep,
    updateSleepEntry,
    deleteSleepEntry,
    updateSleepSchedule,
    recordHomelabAction,
  } as const;
}

type JarvisStore = ReturnType<typeof useJarvisStoreInternal>;

const JarvisStateContext = createContext<JarvisStore | null>(null);

export function JarvisStateProvider({ children }: { children: ReactNode }) {
  const store = useJarvisStoreInternal();
  return createElement(JarvisStateContext.Provider, { value: store }, children);
}

export function useJarvisState() {
  const context = useContext(JarvisStateContext);
  if (!context) {
    throw new Error("useJarvisState must be used within JarvisStateProvider");
  }
  return context;
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
    objectives: sanitizeObjectives(state.objectives),
    homelabActions: sanitizeHomelabActions(state.homelabActions),
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

function sanitizeObjectives(value?: unknown): Objective[] {
  if (!Array.isArray(value)) return [];
  const objectives: Objective[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const objective = entry as Partial<Objective>;
    if (!objective.title || typeof objective.title !== "string") continue;
    const ts = typeof objective.ts === "number" ? objective.ts : Date.now();
    objectives.push({
      id: typeof objective.id === "string" ? objective.id : createId(),
      title: objective.title.trim(),
      area: cleanOptionalString(objective.area),
      target: cleanOptionalString(objective.target),
      nextAction: cleanOptionalString(objective.nextAction),
      status: sanitizeObjectiveStatus(objective.status),
      ts,
      updatedTs: typeof objective.updatedTs === "number" ? objective.updatedTs : ts,
      projects: sanitizeObjectiveProjects(objective.projects),
    });
  }
  return objectives;
}

function sanitizeObjectiveProjects(value?: unknown): ObjectiveProject[] {
  if (!Array.isArray(value)) return [];
  const projects: ObjectiveProject[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const project = entry as Partial<ObjectiveProject>;
    if (!project.title || typeof project.title !== "string") continue;
    projects.push({
      id: typeof project.id === "string" ? project.id : createId(),
      title: project.title.trim(),
      milestone: cleanOptionalString(project.milestone),
      done: Boolean(project.done),
      ts: typeof project.ts === "number" ? project.ts : Date.now(),
      completedTs: typeof project.completedTs === "number" ? project.completedTs : undefined,
    });
  }
  return projects;
}

function sanitizeObjectiveUpdates(
  updates: Partial<Pick<Objective, "title" | "area" | "target" | "nextAction" | "status">>,
) {
  const next: Partial<Pick<Objective, "title" | "area" | "target" | "nextAction" | "status">> = {};
  if (typeof updates.title === "string") {
    const title = cleanOptionalString(updates.title);
    if (title) next.title = title;
  }
  if (typeof updates.area === "string") next.area = cleanOptionalString(updates.area);
  if (typeof updates.target === "string") next.target = cleanOptionalString(updates.target);
  if (typeof updates.nextAction === "string") next.nextAction = cleanOptionalString(updates.nextAction);
  if (updates.status) next.status = sanitizeObjectiveStatus(updates.status);
  return next;
}

function sanitizeObjectiveStatus(value?: string): ObjectiveStatus {
  if (value === "paused" || value === "done") return value;
  return "active";
}

function sanitizeHomelabActions(value?: unknown): HomelabActionLog[] {
  if (!Array.isArray(value)) return [];
  const actions: HomelabActionLog[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const action = entry as Partial<HomelabActionLog>;
    const label = cleanOptionalString(action.label);
    if (!label) continue;
    actions.push({
      id: typeof action.id === "string" ? action.id : createId(),
      ts: typeof action.ts === "number" ? action.ts : Date.now(),
      action: sanitizeHomelabActionType(action.action),
      label,
      target: cleanOptionalString(action.target),
      status: sanitizeHomelabActionStatus(action.status),
      risk: sanitizeHomelabActionRisk(action.risk),
      note: cleanOptionalString(action.note),
    });
    if (actions.length >= MAX_HOMELAB_ACTIONS) break;
  }
  return actions;
}

function sanitizeHomelabActionType(value?: string): HomelabActionType {
  if (
    value === "service-health-check" ||
    value === "service-restart-review" ||
    value === "docs-review"
  ) {
    return value;
  }
  return "refresh-snapshot";
}

function sanitizeHomelabActionStatus(value?: string): HomelabActionStatus {
  if (value === "completed" || value === "blocked") return value;
  return "recorded";
}

function sanitizeHomelabActionRisk(value?: string): HomelabActionRisk {
  return value === "guarded" ? "guarded" : "low";
}

function cleanOptionalString(value?: string) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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
