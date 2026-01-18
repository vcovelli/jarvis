Jarvis OS — Mood, Schedule, and Insight Companion
================================================

A Jarvis-inspired personal console that helps you check in daily, plan your day with time blocks, journal quickly, and surface patterns between sleep, mood, and behavior. Built to start simple (local-first) and evolve into a chat-driven action companion with confirmation flows.

What Success Looks Like
-----------------------

- Fast daily check-ins (≤ 2 minutes): mood + tags + quick notes.
- Schedule + execution clarity: todos + time blocks that feel like a tactical planner.
- Zero-friction journaling: one paragraph, prompt-based, stored by day.
- Immediate feedback loops: streaks, recent entries, blended timeline updates instantly.
- Local-first storage today; clean path to Postgres/Supabase + Google integrations later.
- Future: Chat command bar that proposes actions and requires confirmation before writing.

Current Working App
-------------------

- Location: `apps/web`
- Stack: Next.js (App Router) + React + TypeScript + Tailwind
- Storage: Postgres via Prisma + NextAuth (per-user), with localStorage fallback during sign-in

### What it does now

Sidebar console with dedicated routes:

- **Dashboard**: mood check-ins with tags + notes, operating mode suggestions and lock, Must Win focus, daily review prompt, streaks, and blended timeline.
- **Journal**: prompt-based entries (morning/priority/free) with calendar view and day drill-down.
- **Todos**: 15-minute time blocking grid, priorities, colors/icons, repeat rules, and upcoming schedule highlights.
- **Sleep**: sleep dial logging with quality/recovery/dreams, schedule presets (daily/weekdays/weekends/custom), and recent averages.
- **Review**: weekly insights (sleep, mood, operating modes, Must Win stats) plus a manual reset form.

### Run locally

```
cd apps/web
npm install
npx prisma migrate dev --name init
npm run dev
```

Visit: <http://localhost:3000>

Tip: set up your database connection in `apps/web/.env` (see `apps/web/.env.example`).

Navigation Map
--------------

- `/` — version selector / routing
- `/v2` — Daily Systems Console (overview dashboard)
- `/v2/journal` — Story Grid (journal calendar + entries)
- `/v2/todos` — Mission Planner (time blocking)
- `/v2/sleep` — Recharge Console (sleep logs)
- `/v2/review` — Weekly Systems Review (insights + reset)

Note: We’ll keep routes stable but move implementation to V3 behavior (see below).

Core Experience Pillars (Product Direction)
-------------------------------------------

### Daily Check-in

Fast form for mood (1–10), optional tags (energy, stress, sleep, workout), and short reflection note.

### Journal

Prompt-based quick entry: Morning scan, Priority focus, Free write.

### Todos + Calendar HUD

Mission planner with time blocks: schedule tasks into open slots, planned vs actual timeline (later when calendar is integrated).

### Blended Timeline

Unified feed for mood logs, journal entries, scheduled tasks/blocks, sleep logs.

Local-First Data Model (V1–V3)
------------------------------

Everything is stored as “day + items” so future backends can swap in easily.

```
type DayKey = string; // YYYY-MM-DD

type MoodLog = {
  id: string;
  ts: number;
  mood: number;     // 1–10
  note?: string;
  tags: string[];
};

type JournalEntry = {
  id: string;
  ts: number;
  text: string;
  prompt?: "morning" | "priority" | "free";
};

type TodoItem = {
  id: string;
  createdTs: number;
  day: DayKey;
  text: string;
  done: boolean;
  priority: 1 | 2 | 3;
  timeblockMins?: number; // 15-min increments
  startTime?: string;     // "08:30"
  completedTs?: number;
  order?: number;
  color?: string;
  icon?: string;
};

type SleepEntry = {
  id: string;
  ts: number;
  day: DayKey;
  durationMins: number;
  quality: 1|2|3|4|5;
  startMinutes?: number;
  endMinutes?: number;
  recoveryScore?: number;
  dreams?: string;
  notes?: string;
};

type SleepPresetMode = "daily" | "weekdays" | "weekends" | "custom";
type Day = 0|1|2|3|4|5|6; // Sun=0

type SleepSchedule = {
  mode: SleepPresetMode;
  daily: { lightsOut: string; wake: string };
  weekdays: { lightsOut: string; wake: string };
  weekends: { lightsOut: string; wake: string };
  custom: Record<Day, { lightsOut: string; wake: string }>;
  lastEditedDay?: Day;
};

type OperatingMode = "deep-work" | "execution" | "recovery" | "maintenance" | "push-day";

type OperatingModeEntry = {
  mode: OperatingMode;
  ts: number;
  suggestedMode?: OperatingMode;
};

type MustWinEntry = {
  text: string;
  timeBound?: string;
  done: boolean;
  ts: number;
  completedTs?: number;
};

type DailyReviewEntry = {
  day: DayKey;
  ts: number;
  expected: boolean;
  reason?: "overplanned" | "low-energy" | "distraction" | "external-interruption";
  tomorrow?: string;
};

type WeeklyReviewEntry = {
  weekKey: string;
  ts: number;
  stop: string;
  doubleDown: string;
  experiment: string;
};

type JarvisState = {
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
```

Future: Chat Action Companion (Designed In, Not Built Yet)
---------------------------------------------------------

The chat layer will propose actions and require confirmation before writing:

```
type ProposedAction =
  | { type: "CREATE_TODO"; payload: Partial<TodoItem> }
  | { type: "LOG_MOOD"; payload: { mood: number; note?: string; tags?: string[] } }
  | { type: "ADD_JOURNAL"; payload: { text: string; prompt?: string } }
  | { type: "SCHEDULE_BLOCK"; payload: { day: DayKey; startMins: number; durationMins: number; text: string } };

type Confirmation = {
  id: string;
  proposed: ProposedAction;
  status: "pending" | "accepted" | "rejected";
};
```

Repo Structure
--------------

```
jarvis/
  apps/web/                # Next.js console app
  packages/ui/             # shared HUD components (optional later)
  docs/                    # UX flows, prompts, API contracts
```
