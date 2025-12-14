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
- Storage: browser `localStorage` key: `jarvis-state-v1` (clear site data to reset)

### Features

Sidebar console with dedicated routes:

- **Dashboard**: mood logging, blended timeline feed, quick journal, streak widgets
- **Journal**: calendar heatmap + day drill-down entries + prompt logging
- **Todos**: mission planner + time blocking + upcoming block highlights
- **Sleep**: sleep dial + quality/recovery + dreams + timeline badges

### Run locally

```
cd apps/web
npm install
npm run dev
```

Visit: <http://localhost:3000>

Tip: open DevTools → Application → Local Storage → `jarvis-state-v1` to verify persistence.

Navigation Map
--------------

- `/` — version selector / routing
- `/v2` — Daily Systems Console (overview dashboard)
- `/v2/journal` — Story Grid (journal calendar + entries)
- `/v2/todos` — Mission Planner (time blocking)
- `/v2/sleep` — Recharge Console (sleep logs)

Note: We’ll keep routes stable but move implementation to V3 behavior (see below).

V3 Goals (Next Upgrade)
-----------------------

V3 is a polish + precision scheduling release. No backend yet. No chat agent yet. Just making the console feel locked in.

### 1) Sleep Presets (Weekdays / Weekends / Custom Days)

Add saveable wake schedules:

- Presets: Daily / Weekdays / Weekends / Custom
- Custom supports day grouping (e.g., Mon+Tue same, Wed different, Thu+Fri same)
- “Log sleep” uses the schedule for the selected day.

**Acceptance**

- You can switch preset modes and edit times.
- Changes persist in localStorage.
- Sleep logs feed timeline + averages the same as before.

### 2) Time Blocking in 15-Minute Increments

Upgrade the time block grid:

- Day grid supports 15-minute slots (96 rows/day).
- Blocks snap to 15-minute boundaries.
- Start time dropdown shows 15-min increments.
- Block lengths allow 15-min increments (15, 30, 45, 60, …).

**Acceptance**

- Blocks render aligned to the grid.
- Drag/resizes snap cleanly.
- No jitter / weird overlaps.

### 3) Console Polish Pass

Make everything feel premium:

- consistent focus rings, hover states, chip/button sizing
- keyboard flows:
  - Todos: Enter adds, Cmd/Ctrl+Enter schedules
  - Journal: Cmd/Ctrl+Enter saves
  - Escape exits edits
- subtle toasts: “Saved”, “Scheduled”, “Logged”

**Acceptance**

- UI feels smooth + consistent across all pages.
- No “dead clicks” or unclear states.

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
  tags?: string[];
};

type JournalEntry = {
  id: string;
  ts: number;
  day: DayKey;
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
  startMins?: number;    // minutes from midnight
  durationMins?: number; // 15-min increments in V3
};

type SleepLog = {
  id: string;
  day: DayKey;
  lightsOut: string;  // "23:00"
  wake: string;       // "07:00"
  durationMins: number;
  quality: 1|2|3|4|5;
  recovery: 1|2|3|4|5;
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
};

type JarvisState = {
  mood: Record<DayKey, MoodLog[]>;
  journal: Record<DayKey, JournalEntry[]>;
  todos: Record<DayKey, TodoItem[]>;
  sleep: Record<DayKey, SleepLog[]>;
  sleepSchedule: SleepSchedule;
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

Immediate Next Steps (V3)
-------------------------

1. Implement `sleepSchedule` presets + UI controls on `/v2/sleep`
2. Upgrade `/v2/todos` time grid to 15-minute increments + snapping
3. Add polish pass:
   - keyboard shortcuts
   - toasts
   - consistent component sizing + focus styling
