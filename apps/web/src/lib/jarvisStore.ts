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
const MAX_CUSTOM_MOOD_TAGS = 24;
const MAX_DELETED_MOOD_IDS = 500;
const MAX_DELETED_MOOD_TAGS = 100;
const MAX_DELETED_TODO_IDS = 500;
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

export type HabitIntent = "build" | "quit";
export type HabitLogStatus = "yes" | "no" | "skip" | "empty";

export type HabitEntry = {
  id: string;
  title: string;
  icons: string;
  intent: HabitIntent;
  category?: string;
  createdTs: number;
  updatedTs: number;
  archivedTs?: number;
  order?: number;
  logs: Record<DayKey, HabitLogStatus>;
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
  deletedMoodIds: string[];
  deletedMoodTags: string[];
  journal: Record<DayKey, JournalEntry[]>;
  todos: Record<DayKey, TodoItem[]>;
  deletedTodoIds: string[];
  sleep: Record<DayKey, SleepEntry[]>;
  moodTags: string[];
  sleepSchedule: SleepSchedule;
  operatingMode: Record<DayKey, OperatingModeEntry>;
  mustWin: Record<DayKey, MustWinEntry>;
  habits: HabitEntry[];
  dailyReview: Record<DayKey, DailyReviewEntry>;
  weeklyReview: Record<string, WeeklyReviewEntry>;
  objectives: Objective[];
  homelabActions: HomelabActionLog[];
};

const STORAGE_KEY = "jarvis-state-v1";
const STORAGE_META_KEY = "jarvis-state-meta-v1";
const DEMO_MODE_KEY = "jarvis-demo-mode-v1";
const MAX_HOMELAB_ACTIONS = 100;

export type LocalSaveStatus = "loading" | "saved" | "error";
export type RemoteSaveStatus = "idle" | "pending" | "saving" | "refreshing" | "saved" | "offline" | "error";

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

type StorageContext = ReturnType<typeof buildStorageContext>;

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

function readStoredDemoMode() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredDemoMode(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      window.localStorage.setItem(DEMO_MODE_KEY, "true");
    } else {
      window.localStorage.removeItem(DEMO_MODE_KEY);
    }
  } catch (error) {
    console.warn("Jarvis demo mode save failed", error);
  }
}

function canUseNetwork() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown persistence error";
}

type RemoteSaveResult =
  | {
      status: "saved";
      etag?: string;
      updatedAt?: number;
    }
  | {
      status: "conflict";
      state: unknown;
      etag?: string;
      updatedAt?: number;
    };

type RemoteLoadResult =
  | { type: "not-modified"; etag?: string }
  | { type: "loaded"; state: unknown; etag?: string; updatedAt?: number }
  | { type: "error"; status: number };

async function saveStateToServer(
  state: JarvisState,
  options: { signal?: AbortSignal; keepalive?: boolean; baseEtag?: string | null } = {},
): Promise<RemoteSaveResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.baseEtag) {
    headers["If-Match"] = options.baseEtag;
  }

  const response = await fetch("/api/state", {
    method: "PUT",
    headers,
    body: JSON.stringify({ state, baseEtag: options.baseEtag ?? null }),
    signal: options.signal,
    keepalive: options.keepalive,
  });
  const data = await response.json().catch(() => null);
  if (response.status === 409) {
    return {
      status: "conflict",
      state: data?.state ?? null,
      etag: response.headers.get("etag") ?? undefined,
      updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : undefined,
    };
  }
  if (!response.ok) {
    throw new Error(`State save failed with ${response.status}`);
  }
  return {
    status: "saved",
    etag: response.headers.get("etag") ?? undefined,
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : undefined,
  };
}

async function fetchStateFromServer(
  options: { etag?: string; signal?: AbortSignal } = {},
): Promise<RemoteLoadResult> {
  const headers: Record<string, string> = {};
  if (options.etag) {
    headers["If-None-Match"] = options.etag;
  }

  const response = await fetch("/api/state", {
    headers,
    signal: options.signal,
    cache: "no-store",
  });
  if (response.status === 304) {
    return { type: "not-modified", etag: response.headers.get("etag") ?? options.etag };
  }
  if (!response.ok) {
    return { type: "error", status: response.status };
  }

  const data = await response.json().catch(() => null);
  return {
    type: "loaded",
    state: data?.state ?? null,
    etag: response.headers.get("etag") ?? undefined,
    updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : undefined,
  };
}

function queueStateSaveBeacon(state: JarvisState, baseEtag?: string | null) {
  const body = JSON.stringify({ state, baseEtag: baseEtag ?? null });
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
  deletedMoodIds: [],
  deletedMoodTags: [],
  journal: {},
  todos: {},
  deletedTodoIds: [],
  sleep: {},
  moodTags: [],
  sleepSchedule: defaultSchedule,
  operatingMode: {},
  mustWin: {},
  habits: [],
  dailyReview: {},
  weeklyReview: {},
  objectives: [],
  homelabActions: [],
};

function buildDemoJarvisState(baseDate = new Date()): JarvisState {
  const today = getDayKey(baseDate);
  const yesterday = getDemoDayKey(baseDate, -1);
  const twoDaysAgo = getDemoDayKey(baseDate, -2);
  const tomorrow = getDemoDayKey(baseDate, 1);
  const weekKey = getDemoWeekKey(baseDate);
  const days = Array.from({ length: 7 }, (_, index) => getDemoDayKey(baseDate, index - 6));
  const habitLog = (pattern: HabitLogStatus[]) => {
    return days.reduce((acc, day, index) => {
      acc[day] = pattern[index] ?? "empty";
      return acc;
    }, {} as Record<DayKey, HabitLogStatus>);
  };

  return {
    mood: {
      [today]: [
        {
          id: "demo-mood-today",
          ts: getDemoTimestamp(baseDate, 0, 8, 15),
          mood: 8,
          note: "Clear morning, strong focus window available.",
          tags: ["energy", "focus", "product"],
        },
      ],
      [yesterday]: [
        {
          id: "demo-mood-yesterday",
          ts: getDemoTimestamp(baseDate, -1, 18, 20),
          mood: 7,
          note: "Good execution day, slightly overloaded after lunch.",
          tags: ["stress", "workout"],
        },
      ],
      [twoDaysAgo]: [
        {
          id: "demo-mood-two-days",
          ts: getDemoTimestamp(baseDate, -2, 19, 5),
          mood: 6,
          note: "Energy dipped after a short night.",
          tags: ["sleep", "recovery"],
        },
      ],
    },
    deletedMoodIds: [],
    deletedMoodTags: [],
    journal: {
      [today]: [
        {
          id: "demo-journal-today",
          ts: getDemoTimestamp(baseDate, 0, 7, 45),
          prompt: "priority",
          text: "Anchor the day around the demo narrative: open dashboard, show finance intelligence, then close with assistant follow-through.",
        },
      ],
      [yesterday]: [
        {
          id: "demo-journal-yesterday",
          ts: getDemoTimestamp(baseDate, -1, 21, 15),
          prompt: "free",
          text: "The clearest product moments are the ones where Jarvis turns scattered personal signals into the next obvious action.",
        },
      ],
    },
    todos: {
      [today]: [
        {
          id: "demo-todo-1",
          createdTs: getDemoTimestamp(baseDate, 0, 7, 30),
          day: today,
          text: "Run Jarvis elevator pitch",
          done: false,
          priority: 1,
          startTime: "09:00",
          timeblockMins: 45,
          order: 0,
          color: "#67e8f9",
        },
        {
          id: "demo-todo-2",
          createdTs: getDemoTimestamp(baseDate, 0, 7, 35),
          day: today,
          text: "Review finance classification queue",
          done: false,
          priority: 1,
          startTime: "10:00",
          timeblockMins: 30,
          order: 1,
          color: "#34d399",
        },
        {
          id: "demo-todo-3",
          createdTs: getDemoTimestamp(baseDate, 0, 7, 40),
          day: today,
          text: "Draft investor follow-up notes",
          done: true,
          priority: 2,
          startTime: "11:00",
          timeblockMins: 40,
          completedTs: getDemoTimestamp(baseDate, 0, 11, 42),
          order: 2,
          color: "#fbbf24",
        },
        {
          id: "demo-todo-4",
          createdTs: getDemoTimestamp(baseDate, 0, 8, 0),
          day: today,
          text: "Thirty minute recovery walk",
          done: false,
          priority: 3,
          startTime: "17:30",
          timeblockMins: 30,
          order: 3,
          color: "#a78bfa",
        },
      ],
      [tomorrow]: [
        {
          id: "demo-todo-tomorrow-1",
          createdTs: getDemoTimestamp(baseDate, 0, 12, 10),
          day: tomorrow,
          text: "Package demo feedback into release notes",
          done: false,
          priority: 2,
          startTime: "08:30",
          timeblockMins: 60,
          order: 0,
          color: "#38bdf8",
        },
      ],
    },
    deletedTodoIds: [],
    sleep: {
      [today]: [
        {
          id: "demo-sleep-today",
          ts: getDemoTimestamp(baseDate, 0, 6, 50),
          day: today,
          durationMins: 455,
          quality: 4,
          startMinutes: 23 * 60 + 5,
          endMinutes: 6 * 60 + 40,
          recoveryScore: 86,
          notes: "Solid night with one short wake-up.",
        },
      ],
      [yesterday]: [
        {
          id: "demo-sleep-yesterday",
          ts: getDemoTimestamp(baseDate, -1, 7, 5),
          day: yesterday,
          durationMins: 420,
          quality: 3,
          startMinutes: 23 * 60 + 45,
          endMinutes: 6 * 60 + 45,
          recoveryScore: 72,
          notes: "Shorter night, protected afternoon workload.",
        },
      ],
      [twoDaysAgo]: [
        {
          id: "demo-sleep-two-days",
          ts: getDemoTimestamp(baseDate, -2, 7, 10),
          day: twoDaysAgo,
          durationMins: 490,
          quality: 5,
          startMinutes: 22 * 60 + 40,
          endMinutes: 6 * 60 + 50,
          recoveryScore: 91,
        },
      ],
    },
    moodTags: ["focus", "product", "recovery", "demo"],
    sleepSchedule: {
      ...defaultSchedule,
      daily: { lightsOut: "23:00", wake: "06:45" },
      weekdays: { lightsOut: "22:45", wake: "06:30" },
      weekends: { lightsOut: "00:00", wake: "08:00" },
    },
    operatingMode: {
      [today]: { mode: "deep-work", suggestedMode: "execution", ts: getDemoTimestamp(baseDate, 0, 7, 50) },
      [yesterday]: { mode: "execution", ts: getDemoTimestamp(baseDate, -1, 8, 5) },
    },
    mustWin: {
      [today]: {
        text: "Make the Jarvis demo feel private, polished, and obvious in under five minutes.",
        timeBound: "Before 10:00",
        done: false,
        ts: getDemoTimestamp(baseDate, 0, 7, 55),
      },
      [yesterday]: {
        text: "Ship finance classification fixes and validate the build.",
        timeBound: "Before end of day",
        done: true,
        ts: getDemoTimestamp(baseDate, -1, 8, 0),
        completedTs: getDemoTimestamp(baseDate, -1, 16, 20),
      },
    },
    habits: [
      {
        id: "demo-habit-focus",
        title: "Protect first deep-work block",
        icons: "DW",
        intent: "build",
        category: "Work",
        createdTs: getDemoTimestamp(baseDate, -21, 9, 0),
        updatedTs: getDemoTimestamp(baseDate, 0, 7, 30),
        order: 0,
        logs: habitLog(["yes", "yes", "skip", "yes", "yes", "yes", "yes"]),
      },
      {
        id: "demo-habit-sleep",
        title: "Lights out before 11:15",
        icons: "SL",
        intent: "build",
        category: "Recovery",
        createdTs: getDemoTimestamp(baseDate, -18, 9, 0),
        updatedTs: getDemoTimestamp(baseDate, 0, 7, 30),
        order: 1,
        logs: habitLog(["yes", "no", "yes", "yes", "yes", "skip", "yes"]),
      },
      {
        id: "demo-habit-finance",
        title: "Daily money review",
        icons: "FI",
        intent: "build",
        category: "Finance",
        createdTs: getDemoTimestamp(baseDate, -10, 9, 0),
        updatedTs: getDemoTimestamp(baseDate, 0, 7, 30),
        order: 2,
        logs: habitLog(["yes", "yes", "yes", "empty", "yes", "yes", "yes"]),
      },
    ],
    dailyReview: {
      [yesterday]: {
        day: yesterday,
        ts: getDemoTimestamp(baseDate, -1, 20, 45),
        expected: true,
        tomorrow: "Keep the demo tight: dashboard, finance, assistant, then next action.",
      },
      [twoDaysAgo]: {
        day: twoDaysAgo,
        ts: getDemoTimestamp(baseDate, -2, 20, 30),
        expected: false,
        reason: "overplanned",
        tomorrow: "Reduce commitments and preserve a clean morning block.",
      },
    },
    weeklyReview: {
      [weekKey]: {
        weekKey,
        ts: getDemoTimestamp(baseDate, 0, 8, 20),
        stop: "Letting admin tasks interrupt the first work block.",
        doubleDown: "Using Jarvis to turn reviews into the next calendar-ready action.",
        experiment: "Run every external demo from showcase mode first.",
      },
    },
    objectives: [
      {
        id: "demo-objective-product",
        title: "Launch Jarvis personal command center",
        area: "Product",
        target: "Demo-ready private workspace with finance, routines, and assistant workflows.",
        nextAction: "Record a five minute guided walkthrough.",
        status: "active",
        ts: getDemoTimestamp(baseDate, -30, 9, 0),
        updatedTs: getDemoTimestamp(baseDate, 0, 8, 0),
        projects: [
          {
            id: "demo-project-finance",
            title: "Finance intelligence dashboard",
            milestone: "Classification queue and Plaid insights",
            done: true,
            ts: getDemoTimestamp(baseDate, -14, 10, 0),
            completedTs: getDemoTimestamp(baseDate, -1, 15, 30),
          },
          {
            id: "demo-project-demo-mode",
            title: "Privacy-safe showcase mode",
            milestone: "Settings toggle with dummy data",
            done: false,
            ts: getDemoTimestamp(baseDate, -2, 11, 0),
          },
        ],
      },
      {
        id: "demo-objective-health",
        title: "Raise baseline energy",
        area: "Health",
        target: "Average 7.5 hours sleep and four workouts per week.",
        nextAction: "Keep tonight's wind-down block protected.",
        status: "active",
        ts: getDemoTimestamp(baseDate, -45, 9, 0),
        updatedTs: getDemoTimestamp(baseDate, -1, 18, 0),
        projects: [
          {
            id: "demo-project-sleep",
            title: "Stabilize wake time",
            milestone: "Two-week sleep consistency streak",
            done: false,
            ts: getDemoTimestamp(baseDate, -12, 9, 0),
          },
        ],
      },
    ],
    homelabActions: [
      {
        id: "demo-homelab-1",
        ts: getDemoTimestamp(baseDate, 0, 7, 20),
        action: "refresh-snapshot",
        label: "Refreshed service snapshot",
        target: "jarvis-stack",
        status: "completed",
        risk: "low",
        note: "All core services healthy for demo.",
      },
      {
        id: "demo-homelab-2",
        ts: getDemoTimestamp(baseDate, -1, 18, 10),
        action: "docs-review",
        label: "Reviewed deployment notes",
        target: "finance-sync",
        status: "recorded",
        risk: "low",
      },
    ],
  };
}

function getDemoDayKey(baseDate: Date, offset: number): DayKey {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offset);
  return getDayKey(date);
}

function getDemoTimestamp(baseDate: Date, offset: number, hour: number, minute: number) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function getDemoWeekKey(baseDate: Date) {
  const date = new Date(baseDate);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return getDayKey(date);
}

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
      type: "ADD_HABIT";
      payload: { title: string; icons?: string; intent?: HabitIntent; category?: string };
    }
  | {
      type: "UPDATE_HABIT";
      payload: {
        id: string;
        updates: Partial<Pick<HabitEntry, "title" | "icons" | "intent" | "category" | "order" | "archivedTs">>;
      };
    }
  | { type: "DELETE_HABIT"; payload: { id: string } }
  | {
      type: "RECORD_HABIT";
      payload: { id: string; day?: DayKey; status: HabitLogStatus };
    }
  | { type: "ERASE_HABIT_LOG"; payload: { id: string; day?: DayKey } }
  | { type: "REORDER_HABITS"; payload: { orderedIds: string[] } }
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

function mergeJarvisStates(serverState: JarvisState, localState: JarvisState): JarvisState {
  const deletedMoodIds = mergeDeletedIds(
    serverState.deletedMoodIds,
    localState.deletedMoodIds,
    MAX_DELETED_MOOD_IDS,
  );
  const deletedMoodTags = mergeDeletedMoodTags(
    serverState.deletedMoodTags,
    localState.deletedMoodTags,
  );
  const deletedTodoIds = mergeDeletedTodoIds(serverState.deletedTodoIds, localState.deletedTodoIds);
  const mergedMood = removeMoodTagsFromLogs(
    filterDeletedMoodEntries(
      mergeDayListRecord(serverState.mood, localState.mood),
      deletedMoodIds,
    ),
    deletedMoodTags,
  );
  return sanitizeState({
    mood: mergedMood,
    deletedMoodIds,
    deletedMoodTags,
    journal: mergeDayListRecord(serverState.journal, localState.journal),
    todos: filterDeletedTodos(
      mergeDayListRecord(serverState.todos, localState.todos),
      deletedTodoIds,
    ),
    deletedTodoIds,
    sleep: mergeDayListRecord(serverState.sleep, localState.sleep),
    moodTags: filterDeletedMoodTags(
      sanitizeMoodTagList([...localState.moodTags, ...serverState.moodTags]),
      deletedMoodTags,
    ),
    sleepSchedule: localState.sleepSchedule,
    operatingMode: { ...serverState.operatingMode, ...localState.operatingMode },
    mustWin: { ...serverState.mustWin, ...localState.mustWin },
    habits: mergeHabits(serverState.habits, localState.habits),
    dailyReview: { ...serverState.dailyReview, ...localState.dailyReview },
    weeklyReview: { ...serverState.weeklyReview, ...localState.weeklyReview },
    objectives: mergeObjectives(serverState.objectives, localState.objectives),
    homelabActions: mergeListById(serverState.homelabActions, localState.homelabActions).slice(
      0,
      MAX_HOMELAB_ACTIONS,
    ),
  });
}

function mergeDayListRecord<T extends { id: string }>(
  serverRecord: Record<DayKey, T[]>,
  localRecord: Record<DayKey, T[]>,
): Record<DayKey, T[]> {
  const keys = new Set([...Object.keys(serverRecord), ...Object.keys(localRecord)]);
  return Array.from(keys).reduce((acc, key) => {
    acc[key as DayKey] = mergeListById(serverRecord[key as DayKey] ?? [], localRecord[key as DayKey] ?? []);
    return acc;
  }, {} as Record<DayKey, T[]>);
}

function mergeListById<T extends { id: string }>(serverItems: T[], localItems: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of serverItems) {
    byId.set(item.id, item);
  }
  for (const item of localItems) {
    byId.set(item.id, item);
  }

  const orderedIds = [...localItems.map((item) => item.id)];
  for (const item of serverItems) {
    if (!orderedIds.includes(item.id)) orderedIds.push(item.id);
  }

  return orderedIds
    .map((id) => byId.get(id))
    .filter((item): item is T => Boolean(item));
}

function mergeDeletedTodoIds(serverIds: string[] = [], localIds: string[] = []): string[] {
  return sanitizeDeletedTodoIds([...localIds, ...serverIds]);
}

function mergeDeletedIds(serverIds: string[] = [], localIds: string[] = [], limit: number): string[] {
  return sanitizeDeletedIds([...localIds, ...serverIds], limit);
}

function mergeDeletedMoodTags(serverTags: string[] = [], localTags: string[] = []): string[] {
  return sanitizeDeletedMoodTags([...localTags, ...serverTags]);
}

function addDeletedTodoId(ids: string[], id: string): string[] {
  return sanitizeDeletedTodoIds([id, ...ids]);
}

function filterDeletedTodos(
  todos: Record<DayKey, TodoItem[]>,
  deletedTodoIds: string[],
): Record<DayKey, TodoItem[]> {
  if (!deletedTodoIds.length) return todos;
  const deleted = new Set(deletedTodoIds);
  return Object.entries(todos).reduce((acc, [day, items]) => {
    acc[day as DayKey] = items.filter((todo) => !deleted.has(todo.id));
    return acc;
  }, {} as Record<DayKey, TodoItem[]>);
}

function filterDeletedMoodEntries(
  mood: Record<DayKey, MoodLog[]>,
  deletedMoodIds: string[],
): Record<DayKey, MoodLog[]> {
  if (!deletedMoodIds.length) return mood;
  const deleted = new Set(deletedMoodIds);
  return Object.entries(mood).reduce((acc, [day, entries]) => {
    acc[day as DayKey] = entries.filter((entry) => !deleted.has(entry.id));
    return acc;
  }, {} as Record<DayKey, MoodLog[]>);
}

function filterDeletedMoodTags(tags: string[], deletedTags: string[]): string[] {
  if (!deletedTags.length) return tags;
  const deleted = new Set(deletedTags.map((tag) => tag.toLowerCase()));
  return tags.filter((tag) => !deleted.has(tag.toLowerCase()));
}

function mergeObjectives(serverObjectives: Objective[], localObjectives: Objective[]): Objective[] {
  const serverById = new Map(serverObjectives.map((objective) => [objective.id, objective]));
  const mergedById = new Map<string, Objective>();

  for (const objective of serverObjectives) {
    mergedById.set(objective.id, objective);
  }
  for (const objective of localObjectives) {
    const serverObjective = serverById.get(objective.id);
    mergedById.set(
      objective.id,
      serverObjective
        ? {
            ...serverObjective,
            ...objective,
            projects: mergeListById(serverObjective.projects, objective.projects),
          }
        : objective,
    );
  }

  const orderedIds = [...localObjectives.map((objective) => objective.id)];
  for (const objective of serverObjectives) {
    if (!orderedIds.includes(objective.id)) orderedIds.push(objective.id);
  }

  return orderedIds
    .map((id) => mergedById.get(id))
    .filter((objective): objective is Objective => Boolean(objective));
}

function mergeHabits(serverHabits: HabitEntry[], localHabits: HabitEntry[]): HabitEntry[] {
  const serverById = new Map(serverHabits.map((habit) => [habit.id, habit]));
  const mergedById = new Map<string, HabitEntry>();

  for (const habit of serverHabits) {
    mergedById.set(habit.id, habit);
  }
  for (const habit of localHabits) {
    const serverHabit = serverById.get(habit.id);
    mergedById.set(
      habit.id,
      serverHabit
        ? {
            ...serverHabit,
            ...habit,
            logs: { ...serverHabit.logs, ...habit.logs },
            updatedTs: Math.max(serverHabit.updatedTs, habit.updatedTs),
          }
        : habit,
    );
  }

  const orderedIds = [...localHabits.map((habit) => habit.id)];
  for (const habit of serverHabits) {
    if (!orderedIds.includes(habit.id)) orderedIds.push(habit.id);
  }

  return orderedIds
    .map((id) => mergedById.get(id))
    .filter((habit): habit is HabitEntry => Boolean(habit))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdTs - a.createdTs);
}

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
      const nextLogs = logs.filter((log) => log.id !== action.payload.id);
      if (nextLogs.length === logs.length && state.deletedMoodIds.includes(action.payload.id)) {
        return state;
      }
      return {
        ...state,
        mood: {
          ...state.mood,
          [action.payload.day]: nextLogs,
        },
        deletedMoodIds: sanitizeDeletedIds(
          [action.payload.id, ...state.deletedMoodIds],
          MAX_DELETED_MOOD_IDS,
        ),
      };
    }
    case "ADD_MOOD_TAG": {
      const tag = normalizeMoodTag(action.payload.tag);
      if (!tag) return state;
      const normalized = tag.toLowerCase();
      if (state.moodTags.some((existing) => existing.toLowerCase() === normalized)) {
        return state;
      }
      if (state.moodTags.length >= MAX_CUSTOM_MOOD_TAGS) return state;
      return {
        ...state,
        moodTags: [...state.moodTags, tag],
        deletedMoodTags: state.deletedMoodTags.filter(
          (deletedTag) => deletedTag.toLowerCase() !== normalized,
        ),
      };
    }
    case "RENAME_MOOD_TAG": {
      const from = normalizeMoodTag(action.payload.from);
      const to = normalizeMoodTag(action.payload.to);
      if (!from || !to) return state;
      const fromIndex = state.moodTags.findIndex((tag) => tag.toLowerCase() === from.toLowerCase());
      if (fromIndex === -1) return state;
      const normalizedTo = to.toLowerCase();
      if (
        state.moodTags.some((tag, index) => index !== fromIndex && tag.toLowerCase() === normalizedTo)
      ) {
        return state;
      }
      const updatedTags = [...state.moodTags];
      const previousValue = updatedTags[fromIndex];
      updatedTags[fromIndex] = to;
      const updatedMoodLogs = replaceMoodTagInLogs(state.mood, previousValue, to);
      const renamedIdentity = previousValue.toLowerCase() !== normalizedTo;
      return {
        ...state,
        moodTags: updatedTags,
        mood: updatedMoodLogs,
        deletedMoodTags: renamedIdentity
          ? sanitizeDeletedMoodTags([
              previousValue,
              ...state.deletedMoodTags.filter((tag) => tag.toLowerCase() !== normalizedTo),
            ])
          : state.deletedMoodTags.filter((tag) => tag.toLowerCase() !== normalizedTo),
      };
    }
    case "DELETE_MOOD_TAG": {
      const normalized = normalizeMoodTag(action.payload.tag);
      if (!normalized) return state;
      const filtered = state.moodTags.filter((tag) => tag.toLowerCase() !== normalized.toLowerCase());
      const deletedMoodTags = sanitizeDeletedMoodTags([normalized, ...state.deletedMoodTags]);
      const mood = removeMoodTagsFromLogs(state.mood, [normalized]);
      const wasAlreadyDeleted = state.deletedMoodTags.some(
        (tag) => tag.toLowerCase() === normalized.toLowerCase(),
      );
      if (
        filtered.length === state.moodTags.length &&
        mood === state.mood &&
        wasAlreadyDeleted
      ) {
        return state;
      }
      return {
        ...state,
        moodTags: filtered,
        mood,
        deletedMoodTags,
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
    case "ADD_HABIT": {
      const title = cleanOptionalString(action.payload.title);
      if (!title) return state;
      const now = Date.now();
      const maxOrder = state.habits.reduce((max, habit, index) => {
        return Math.max(max, habit.order ?? index);
      }, -1);
      const habit: HabitEntry = {
        id: createId(),
        title,
        icons: normalizeHabitIcons(action.payload.icons),
        intent: sanitizeHabitIntent(action.payload.intent),
        category: cleanOptionalString(action.payload.category),
        createdTs: now,
        updatedTs: now,
        order: maxOrder + 1,
        logs: {},
      };
      return {
        ...state,
        habits: [...state.habits, habit],
      };
    }
    case "UPDATE_HABIT": {
      const now = Date.now();
      const updates = sanitizeHabitUpdates(action.payload.updates);
      return {
        ...state,
        habits: state.habits.map((habit) =>
          habit.id === action.payload.id
            ? {
                ...habit,
                ...updates,
                updatedTs: now,
              }
            : habit,
        ),
      };
    }
    case "DELETE_HABIT": {
      return {
        ...state,
        habits: state.habits.filter((habit) => habit.id !== action.payload.id),
      };
    }
    case "RECORD_HABIT": {
      const day = normalizeDayKey(action.payload.day);
      const status = sanitizeHabitStatus(action.payload.status);
      return {
        ...state,
        habits: state.habits.map((habit) =>
          habit.id === action.payload.id
            ? {
                ...habit,
                updatedTs: Date.now(),
                logs: {
                  ...habit.logs,
                  [day]: status,
                },
              }
            : habit,
        ),
      };
    }
    case "ERASE_HABIT_LOG": {
      const day = normalizeDayKey(action.payload.day);
      return {
        ...state,
        habits: state.habits.map((habit) => {
          if (habit.id !== action.payload.id || habit.logs[day] === "empty") return habit;
          return {
            ...habit,
            updatedTs: Date.now(),
            logs: {
              ...habit.logs,
              [day]: "empty",
            },
          };
        }),
      };
    }
    case "REORDER_HABITS": {
      const orderMap = new Map(action.payload.orderedIds.map((id, index) => [id, index]));
      const now = Date.now();
      return {
        ...state,
        habits: state.habits
          .map((habit, index) => ({
            ...habit,
            order: orderMap.get(habit.id) ?? action.payload.orderedIds.length + index,
            updatedTs: orderMap.has(habit.id) ? now : habit.updatedTs,
          }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdTs - a.createdTs),
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
      let changed = false;
      const nextTodos = Object.entries(state.todos).reduce((acc, [day, todosForDay]) => {
        const filtered = todosForDay.filter((todo) => todo.id !== action.payload.id);
        if (filtered.length !== todosForDay.length) changed = true;
        acc[day as DayKey] = filtered;
        return acc;
      }, {} as Record<DayKey, TodoItem[]>);
      if (!changed && state.deletedTodoIds.includes(action.payload.id)) return state;
      return {
        ...state,
        todos: nextTodos,
        deletedTodoIds: addDeletedTodoId(state.deletedTodoIds, action.payload.id),
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
  const [demoSeed] = useState(() => buildDemoJarvisState());
  const [demoState, demoDispatch] = useReducer(reducer, demoSeed);
  const [demoMode, setDemoMode] = useState(false);
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
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastAutoRefreshRef = useRef(0);
  const lastHiddenAtRef = useRef(0);
  const scheduleSyncStatus = useCallback(
    (updater: (current: StateSyncStatus) => StateSyncStatus) => {
      Promise.resolve().then(() => setSyncStatus(updater));
    },
    [],
  );
  const activeState = demoMode ? demoState : state;
  const visibleSyncStatus: StateSyncStatus = demoMode
    ? {
        local: "saved",
        remote: "idle",
        error: undefined,
      }
    : syncStatus;
  useEffect(() => {
    if (!readStoredDemoMode()) return;
    demoDispatch({ type: "HYDRATE", payload: buildDemoJarvisState() });
    setDemoMode(true);
  }, []);

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

  const dispatchUserAction = useCallback((action: Action) => {
    if (demoMode) {
      demoDispatch(action);
      return;
    }

    // Commit to the ref and local cache before React effects run. This closes
    // the short loss window when a user saves and immediately navigates away,
    // backgrounds the PWA, or closes the page.
    const nextState = reducer(stateRef.current, action);
    stateRef.current = nextState;
    persistLocalSnapshot(nextState, { pendingRemoteSave: true });
    dispatch(action);
  }, [demoMode, persistLocalSnapshot]);

  const handleSaveConflict = useCallback(
    (
      context: StorageContext,
      result: Extract<RemoteSaveResult, { status: "conflict" }>,
      localState: JarvisState,
    ) => {
      const serverState = sanitizeState(result.state);
      const serverStateJson = JSON.stringify(serverState);
      const serverEtag = result.etag ?? createETagFromJson(serverStateJson);
      const syncedAt = Date.now();
      const mergedState = mergeJarvisStates(serverState, localState);

      lastRemoteSaveRef.current = `${context.storageKey}:${serverStateJson}`;
      stateRef.current = mergedState;
      persistLocalSnapshot(mergedState, {
        etag: serverEtag,
        pendingRemoteSave: true,
        remoteSyncedAt: syncedAt,
        remoteUpdatedAt: result.updatedAt,
      });
      dispatch({ type: "HYDRATE", payload: mergedState });
    },
    [persistLocalSnapshot],
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
        current.remote === "pending" ||
          current.remote === "saving" ||
          current.remote === "refreshing" ||
          current.remote === "error"
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
    fetch("/api/state", { headers, cache: "no-store" })
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
    const baseMeta = readStoredMeta(context.metaKey);
    scheduleSyncStatus((current) => ({ ...current, remote: "saving", error: undefined }));
    void saveStateToServer(state, { signal: controller.signal, baseEtag: baseMeta?.etag ?? null })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.status === "conflict") {
          handleSaveConflict(context, result, stateRef.current);
          return;
        }
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
  }, [
    state,
    hydrated,
    scheduleSyncStatus,
    status,
    session?.user?.id,
    networkRetryTick,
    handleSaveConflict,
  ]);

  const refreshRemoteState = useCallback(
    (options: { silent?: boolean } = {}) => {
      if (refreshInFlightRef.current) {
        if (!options.silent) {
          scheduleSyncStatus((current) => ({ ...current, remote: "refreshing", error: undefined }));
        }
        return refreshInFlightRef.current;
      }

      const operation = (async () => {
        const context = buildStorageContext(status, session?.user?.id);
        if (!hydrated || !readyRef.current || lastUserRef.current !== context.userKey) return false;
        if (!context.isAuthenticated) return false;
        if (!canUseNetwork()) {
          scheduleSyncStatus((current) => ({ ...current, remote: "offline" }));
          return false;
        }

        if (!options.silent) {
          scheduleSyncStatus((current) => ({ ...current, remote: "refreshing", error: undefined }));
        }

        try {
          const startingState = stateRef.current;
          const startingStateJson = JSON.stringify(startingState);
          const startingSignature = `${context.storageKey}:${startingStateJson}`;
          const startingMeta = readStoredMeta(context.metaKey);
          const needsRemoteSave = Boolean(
            startingMeta?.pendingRemoteSave || lastRemoteSaveRef.current !== startingSignature,
          );

          if (needsRemoteSave) {
            const saveResult = await saveStateToServer(startingState, {
              baseEtag: startingMeta?.etag ?? null,
            });
            if (saveResult.status === "conflict") {
              handleSaveConflict(context, saveResult, stateRef.current);
              return true;
            }

            const syncedAt = Date.now();
            const currentMeta = readStoredMeta(context.metaKey);
            writeStoredMeta(context.metaKey, {
              ...(currentMeta ?? {}),
              etag: saveResult.etag ?? createETagFromJson(startingStateJson),
              savedAt: currentMeta?.savedAt ?? syncedAt,
              pendingRemoteSave: false,
              remoteSyncedAt: syncedAt,
              remoteUpdatedAt: saveResult.updatedAt ?? currentMeta?.remoteUpdatedAt,
            });
            lastRemoteSaveRef.current = startingSignature;
          }

          const refreshMeta = readStoredMeta(context.metaKey);
          const remoteResult = await fetchStateFromServer({ etag: refreshMeta?.etag });
          if (remoteResult.type === "not-modified") {
            const syncedAt = Date.now();
            setSyncStatus((current) => ({
              ...current,
              remote: "saved",
              lastRemoteSavedAt: syncedAt,
              error: undefined,
            }));
            return true;
          }
          if (remoteResult.type === "error") {
            throw new Error(`State refresh failed with ${remoteResult.status}`);
          }

          const syncedAt = Date.now();
          if (!remoteResult.state) {
            const localStateJson = JSON.stringify(stateRef.current);
            const localSignature = `${context.storageKey}:${localStateJson}`;
            const localIsInitial = localStateJson === JSON.stringify(initialState);
            writeStoredMeta(context.metaKey, {
              ...(readStoredMeta(context.metaKey) ?? {}),
              etag: remoteResult.etag ?? createETagFromJson(JSON.stringify(null)),
              savedAt: syncedAt,
              pendingRemoteSave: !localIsInitial,
              remoteSyncedAt: syncedAt,
              remoteUpdatedAt: remoteResult.updatedAt,
            });
            lastLocalSaveRef.current = localSignature;
            lastRemoteSaveRef.current = localIsInitial ? localSignature : `${context.storageKey}:null`;
            setSyncStatus({
              local: "saved",
              remote: localIsInitial ? "saved" : "pending",
              lastLocalSavedAt: syncedAt,
              lastRemoteSavedAt: syncedAt,
            });
            return true;
          }

          const serverState = sanitizeState(remoteResult.state);
          const serverStateJson = JSON.stringify(serverState);
          const serverSignature = `${context.storageKey}:${serverStateJson}`;
          const latestLocalState = stateRef.current;
          const latestLocalStateJson = JSON.stringify(latestLocalState);
          const latestLocalSignature = `${context.storageKey}:${latestLocalStateJson}`;
          const latestMeta = readStoredMeta(context.metaKey);
          const shouldMerge = Boolean(
            latestMeta?.pendingRemoteSave ||
              (lastRemoteSaveRef.current &&
                lastRemoteSaveRef.current !== latestLocalSignature &&
                latestLocalSignature !== serverSignature),
          );
          const nextState = shouldMerge
            ? mergeJarvisStates(serverState, latestLocalState)
            : serverState;
          const nextStateJson = JSON.stringify(nextState);
          const nextSignature = `${context.storageKey}:${nextStateJson}`;
          const nextEtag = createETagFromJson(nextStateJson);

          if (nextStateJson !== latestLocalStateJson) {
            stateRef.current = nextState;
            dispatch({ type: "HYDRATE", payload: nextState });
          }
          writeStoredState(context.storageKey, nextStateJson);
          writeStoredMeta(context.metaKey, {
            etag: shouldMerge
              ? remoteResult.etag ?? createETagFromJson(serverStateJson)
              : remoteResult.etag ?? nextEtag,
            savedAt: syncedAt,
            pendingRemoteSave: shouldMerge,
            remoteSyncedAt: syncedAt,
            remoteUpdatedAt: remoteResult.updatedAt,
          });
          lastLocalSaveRef.current = nextSignature;
          lastRemoteSaveRef.current = shouldMerge ? serverSignature : nextSignature;
          setSyncStatus({
            local: "saved",
            remote: shouldMerge ? "pending" : "saved",
            lastLocalSavedAt: syncedAt,
            lastRemoteSavedAt: syncedAt,
          });
          return true;
        } catch (error) {
          console.warn("Jarvis state refresh failed", error);
          scheduleSyncStatus((current) => ({
            ...current,
            remote: canUseNetwork() ? "error" : "offline",
            error: getErrorMessage(error),
          }));
          return false;
        }
      })();

      refreshInFlightRef.current = operation;
      const releaseOperation = () => {
        if (refreshInFlightRef.current === operation) {
          refreshInFlightRef.current = null;
        }
      };
      void operation.then(releaseOperation, releaseOperation);
      return operation;
    },
    [handleSaveConflict, hydrated, scheduleSyncStatus, session?.user?.id, status],
  );

  const enableDemoMode = useCallback(() => {
    demoDispatch({ type: "HYDRATE", payload: buildDemoJarvisState() });
    setDemoMode(true);
    writeStoredDemoMode(true);
  }, []);

  const disableDemoMode = useCallback(() => {
    setDemoMode(false);
    writeStoredDemoMode(false);
  }, []);

  const resetDemoMode = useCallback(() => {
    demoDispatch({ type: "HYDRATE", payload: buildDemoJarvisState() });
    setDemoMode(true);
    writeStoredDemoMode(true);
  }, []);

  const refreshVisibleState = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (demoMode) return false;
      return refreshRemoteState(options);
    },
    [demoMode, refreshRemoteState],
  );

  useEffect(() => {
    if (!hydrated || !readyRef.current) return;

    function requestResumeRefresh(force = false) {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      const returnedFromBackground =
        lastHiddenAtRef.current > 0 && now - lastHiddenAtRef.current >= 1200;
      lastHiddenAtRef.current = 0;
      if (!force && !returnedFromBackground && now - lastAutoRefreshRef.current < 4000) return;
      lastAutoRefreshRef.current = now;
      void refreshRemoteState({ silent: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        lastHiddenAtRef.current = Date.now();
        return;
      }
      requestResumeRefresh();
    }

    function handleOnlineRefresh() {
      requestResumeRefresh(true);
    }

    function handlePageShow(event: PageTransitionEvent) {
      requestResumeRefresh(event.persisted);
    }

    function handleFocus() {
      requestResumeRefresh();
    }

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnlineRefresh);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnlineRefresh);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hydrated, refreshRemoteState]);

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

      if (queueStateSaveBeacon(stateRef.current, meta?.etag ?? null)) {
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
      dispatchUserAction({ type: "LOG_MOOD", payload });
    },
    [dispatchUserAction],
  );

  const updateMood = useCallback(
    (payload: { day: DayKey; id: string; updates: Partial<Pick<MoodLog, "mood" | "note" | "tags">> }) => {
      dispatchUserAction({ type: "UPDATE_MOOD", payload });
    },
    [dispatchUserAction],
  );

  const deleteMood = useCallback((payload: { day: DayKey; id: string }) => {
    dispatchUserAction({ type: "DELETE_MOOD", payload });
  }, [dispatchUserAction]);

  const addMoodTagToLibrary = useCallback((payload: { tag: string }) => {
    dispatchUserAction({ type: "ADD_MOOD_TAG", payload });
  }, [dispatchUserAction]);

  const renameMoodTag = useCallback((payload: { from: string; to: string }) => {
    dispatchUserAction({ type: "RENAME_MOOD_TAG", payload });
  }, [dispatchUserAction]);

  const deleteMoodTagFromLibrary = useCallback((payload: { tag: string }) => {
    dispatchUserAction({ type: "DELETE_MOOD_TAG", payload });
  }, [dispatchUserAction]);

  const addJournal = useCallback(
    (payload: { text: string; prompt?: JournalPrompt; day?: DayKey }) => {
      dispatchUserAction({ type: "ADD_JOURNAL", payload });
    },
    [dispatchUserAction],
  );

  const setOperatingMode = useCallback(
    (payload: { day?: DayKey; mode: OperatingMode; suggestedMode?: OperatingMode }) => {
      dispatchUserAction({ type: "SET_OPERATING_MODE", payload });
    },
    [dispatchUserAction],
  );

  const setMustWin = useCallback(
    (payload: { day?: DayKey; text: string; timeBound?: string }) => {
      dispatchUserAction({ type: "SET_MUST_WIN", payload });
    },
    [dispatchUserAction],
  );

  const toggleMustWin = useCallback((payload: { day: DayKey }) => {
    dispatchUserAction({ type: "TOGGLE_MUST_WIN", payload });
  }, [dispatchUserAction]);

  const logDailyReview = useCallback(
    (payload: { day?: DayKey; expected: boolean; reason?: DailyReviewReason; tomorrow?: string }) => {
      dispatchUserAction({ type: "LOG_DAILY_REVIEW", payload });
    },
    [dispatchUserAction],
  );

  const addHabit = useCallback(
    (payload: { title: string; icons?: string; intent?: HabitIntent; category?: string }) => {
      dispatchUserAction({ type: "ADD_HABIT", payload });
    },
    [dispatchUserAction],
  );

  const updateHabit = useCallback(
    (payload: {
      id: string;
      updates: Partial<Pick<HabitEntry, "title" | "icons" | "intent" | "category" | "order" | "archivedTs">>;
    }) => {
      dispatchUserAction({ type: "UPDATE_HABIT", payload });
    },
    [dispatchUserAction],
  );

  const deleteHabit = useCallback((payload: { id: string }) => {
    dispatchUserAction({ type: "DELETE_HABIT", payload });
  }, [dispatchUserAction]);

  const recordHabit = useCallback(
    (payload: { id: string; day?: DayKey; status: HabitLogStatus }) => {
      dispatchUserAction({ type: "RECORD_HABIT", payload });
    },
    [dispatchUserAction],
  );

  const eraseHabitLog = useCallback((payload: { id: string; day?: DayKey }) => {
    dispatchUserAction({ type: "ERASE_HABIT_LOG", payload });
  }, [dispatchUserAction]);

  const reorderHabits = useCallback((payload: { orderedIds: string[] }) => {
    dispatchUserAction({ type: "REORDER_HABITS", payload });
  }, [dispatchUserAction]);

  const saveWeeklyReview = useCallback(
    (payload: { weekKey: string; stop: string; doubleDown: string; experiment: string }) => {
      dispatchUserAction({ type: "SAVE_WEEKLY_REVIEW", payload });
    },
    [dispatchUserAction],
  );

  const addObjective = useCallback(
    (payload: { title: string; area?: string; target?: string; nextAction?: string }) => {
      dispatchUserAction({ type: "ADD_OBJECTIVE", payload });
    },
    [dispatchUserAction],
  );

  const updateObjective = useCallback(
    (payload: {
      id: string;
      updates: Partial<Pick<Objective, "title" | "area" | "target" | "nextAction" | "status">>;
    }) => {
      dispatchUserAction({ type: "UPDATE_OBJECTIVE", payload });
    },
    [dispatchUserAction],
  );

  const deleteObjective = useCallback((payload: { id: string }) => {
    dispatchUserAction({ type: "DELETE_OBJECTIVE", payload });
  }, [dispatchUserAction]);

  const addObjectiveProject = useCallback(
    (payload: { objectiveId: string; title: string; milestone?: string }) => {
      dispatchUserAction({ type: "ADD_OBJECTIVE_PROJECT", payload });
    },
    [dispatchUserAction],
  );

  const toggleObjectiveProject = useCallback(
    (payload: { objectiveId: string; projectId: string }) => {
      dispatchUserAction({ type: "TOGGLE_OBJECTIVE_PROJECT", payload });
    },
    [dispatchUserAction],
  );

  const updateJournalEntry = useCallback(
    (payload: { day: DayKey; id: string; updates: Partial<Pick<JournalEntry, "text" | "prompt">> }) => {
      dispatchUserAction({ type: "UPDATE_JOURNAL", payload });
    },
    [dispatchUserAction],
  );

  const deleteJournalEntry = useCallback((payload: { day: DayKey; id: string }) => {
    dispatchUserAction({ type: "DELETE_JOURNAL", payload });
  }, [dispatchUserAction]);

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
      dispatchUserAction({ type: "ADD_TODO", payload });
    },
    [dispatchUserAction],
  );

  const toggleTodo = useCallback((payload: { day: DayKey; id: string }) => {
    dispatchUserAction({ type: "TOGGLE_TODO", payload });
  }, [dispatchUserAction]);

  const updateTodoPriority = useCallback(
    (payload: { day: DayKey; id: string; priority: TodoPriority }) => {
      dispatchUserAction({ type: "UPDATE_TODO_PRIORITY", payload });
    },
    [dispatchUserAction],
  );

  const updateTodo = useCallback(
    (payload: {
      day: DayKey;
      id: string;
      updates: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime" | "color" | "icon">>;
    }) => {
      dispatchUserAction({ type: "UPDATE_TODO", payload });
    },
    [dispatchUserAction],
  );

  const moveTodo = useCallback(
    (payload: {
      fromDay: DayKey;
      id: string;
      toDay: DayKey;
      updates?: Partial<Pick<TodoItem, "text" | "priority" | "timeblockMins" | "startTime" | "color" | "icon">>;
    }) => {
      dispatchUserAction({ type: "MOVE_TODO", payload });
    },
    [dispatchUserAction],
  );

  const reorderTodos = useCallback((payload: { day: DayKey; orderedIds: string[] }) => {
    dispatchUserAction({ type: "REORDER_TODOS", payload });
  }, [dispatchUserAction]);

  const deleteTodo = useCallback((payload: { day: DayKey; id: string }) => {
    dispatchUserAction({ type: "DELETE_TODO", payload });
  }, [dispatchUserAction]);

  const updateTodoSchedule = useCallback(
    (payload: { day: DayKey; id: string; startTime?: string; timeblockMins?: Timeblock }) => {
      dispatchUserAction({ type: "UPDATE_TODO_SCHEDULE", payload });
    },
    [dispatchUserAction],
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
      dispatchUserAction({ type: "LOG_SLEEP", payload });
    },
    [dispatchUserAction],
  );

  const updateSleepEntry = useCallback(
    (payload: {
      day: DayKey;
      id: string;
      updates: Partial<
        Pick<SleepEntry, "durationMins" | "quality" | "startMinutes" | "endMinutes" | "recoveryScore" | "dreams" | "notes">
      >;
    }) => {
      dispatchUserAction({ type: "UPDATE_SLEEP_ENTRY", payload });
    },
    [dispatchUserAction],
  );

  const deleteSleepEntry = useCallback((payload: { day: DayKey; id: string }) => {
    dispatchUserAction({ type: "DELETE_SLEEP_ENTRY", payload });
  }, [dispatchUserAction]);

  const updateSleepSchedule = useCallback((payload: SleepSchedule) => {
    dispatchUserAction({ type: "SET_SLEEP_SCHEDULE", payload });
  }, [dispatchUserAction]);

  const recordHomelabAction = useCallback(
    (payload: {
      action: HomelabActionType;
      label: string;
      target?: string;
      status: HomelabActionStatus;
      risk: HomelabActionRisk;
      note?: string;
    }) => {
      dispatchUserAction({ type: "RECORD_HOMELAB_ACTION", payload });
    },
    [dispatchUserAction],
  );

  return {
    state: activeState,
    hydrated,
    syncStatus: visibleSyncStatus,
    demoMode,
    enableDemoMode,
    disableDemoMode,
    resetDemoMode,
    refreshRemoteState: refreshVisibleState,
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
    addHabit,
    updateHabit,
    deleteHabit,
    recordHabit,
    eraseHabitLog,
    reorderHabits,
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
  const deletedMoodIds = sanitizeDeletedIds(state.deletedMoodIds, MAX_DELETED_MOOD_IDS);
  const deletedMoodTags = sanitizeDeletedMoodTags(state.deletedMoodTags);
  return {
    mood: removeMoodTagsFromLogs(
      filterDeletedMoodEntries(sanitizeRecord(state.mood), deletedMoodIds),
      deletedMoodTags,
    ),
    deletedMoodIds,
    deletedMoodTags,
    journal: sanitizeRecord(state.journal),
    todos: filterDeletedTodos(
      sanitizeRecord(state.todos),
      sanitizeDeletedTodoIds(state.deletedTodoIds),
    ),
    deletedTodoIds: sanitizeDeletedTodoIds(state.deletedTodoIds),
    sleep: sanitizeRecord(state.sleep),
    moodTags: filterDeletedMoodTags(sanitizeMoodTagList(state.moodTags), deletedMoodTags),
    sleepSchedule: sanitizeSleepSchedule(state.sleepSchedule),
    operatingMode: sanitizeDayValueRecord(state.operatingMode),
    mustWin: sanitizeDayValueRecord(state.mustWin),
    habits: sanitizeHabits(state.habits),
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

function sanitizeDeletedTodoIds(value?: unknown): string[] {
  return sanitizeDeletedIds(value, MAX_DELETED_TODO_IDS);
}

function sanitizeDeletedIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function sanitizeDeletedMoodTags(value?: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = normalizeMoodTag(entry);
    if (!tag) continue;
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(tag);
    if (tags.length >= MAX_DELETED_MOOD_TAGS) break;
  }
  return tags;
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
    if (seen.has(lower)) continue;
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

function sanitizeHabits(value?: unknown): HabitEntry[] {
  if (!Array.isArray(value)) return [];
  const habits: HabitEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const habit = entry as Partial<HabitEntry>;
    const title = cleanOptionalString(habit.title);
    if (!title) continue;
    const createdTs = typeof habit.createdTs === "number" ? habit.createdTs : Date.now();
    habits.push({
      id: typeof habit.id === "string" ? habit.id : createId(),
      title,
      icons: normalizeHabitIcons(habit.icons),
      intent: sanitizeHabitIntent(habit.intent),
      category: cleanOptionalString(habit.category),
      createdTs,
      updatedTs: typeof habit.updatedTs === "number" ? habit.updatedTs : createdTs,
      archivedTs: typeof habit.archivedTs === "number" ? habit.archivedTs : undefined,
      order: typeof habit.order === "number" ? habit.order : habits.length,
      logs: sanitizeHabitLogs(habit.logs),
    });
  }
  return habits.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || b.createdTs - a.createdTs);
}

function sanitizeHabitLogs(value?: unknown): Record<DayKey, HabitLogStatus> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((acc, [key, status]) => {
    const normalizedKey = extractDayKey(key) ?? (key as DayKey);
    acc[normalizedKey] = sanitizeHabitStatus(status);
    return acc;
  }, {} as Record<DayKey, HabitLogStatus>);
}

function sanitizeHabitUpdates(
  updates: Partial<Pick<HabitEntry, "title" | "icons" | "intent" | "category" | "order" | "archivedTs">>,
) {
  const next: Partial<Pick<HabitEntry, "title" | "icons" | "intent" | "category" | "order" | "archivedTs">> = {};
  if (typeof updates.title === "string") {
    const title = cleanOptionalString(updates.title);
    if (title) next.title = title;
  }
  if (typeof updates.icons === "string") next.icons = normalizeHabitIcons(updates.icons);
  if (typeof updates.intent === "string") next.intent = sanitizeHabitIntent(updates.intent);
  if (typeof updates.category === "string") next.category = cleanOptionalString(updates.category);
  if (typeof updates.order === "number") next.order = updates.order;
  if (Object.prototype.hasOwnProperty.call(updates, "archivedTs")) {
    next.archivedTs = typeof updates.archivedTs === "number" ? updates.archivedTs : undefined;
  }
  return next;
}

function sanitizeHabitIntent(value?: string): HabitIntent {
  return value === "quit" ? "quit" : "build";
}

function sanitizeHabitStatus(value: unknown): HabitLogStatus {
  if (value === "no" || value === "skip" || value === "empty") return value;
  return "yes";
}

function normalizeHabitIcons(value?: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, 16) : "✓";
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

function removeMoodTagsFromLogs(
  mood: Record<DayKey, MoodLog[]>,
  tags: string[],
): Record<DayKey, MoodLog[]> {
  if (!tags.length) return mood;
  const deletedTags = new Set(tags.map((tag) => tag.toLowerCase()));
  let changed = false;
  const updatedEntries = Object.entries(mood).reduce((acc, [day, logs]) => {
    let dayChanged = false;
    const nextLogs = logs.map((log) => {
      if (!log.tags?.length) return log;
      const nextTags = log.tags.filter((tag) => !deletedTags.has(tag.toLowerCase()));
      if (nextTags.length === log.tags.length) return log;
      dayChanged = true;
      changed = true;
      return { ...log, tags: nextTags };
    });
    acc[day as DayKey] = dayChanged ? nextLogs : logs;
    return acc;
  }, {} as Record<DayKey, MoodLog[]>);
  return changed ? updatedEntries : mood;
}
