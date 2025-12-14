# Jarvis OS — Mood, Schedule, and Insight Companion

A personal, Jarvis-inspired interface that helps you check in daily, orchestrate your calendar, and surface the patterns behind how you feel and how you spend time. This repository currently tracks the concept, design system, and delivery plan so implementation can start from a well-defined blueprint.

## What Success Looks Like

- **Fast daily check-ins (≤ 2 minutes)** capturing mood, energy, stress, sleep, tags, and reflections.
- **Minimal friction, maximum insight** — charts, streaks, and correlations update immediately after each check-in.
- **Calendar orchestration** — block focus time, schedule activities, and reconcile what actually happened.
- **Adaptive UI that feels alive** — layout, colors, and prompts respond to recent behavior without feeling gimmicky.
- **Portable data** stored either in PostgreSQL/Supabase or mirrored to Google Sheets for personal analysis.

## Super-Simple v0 (Just to Start)

Goal: stand up a working slice you can poke today. Keep everything local and in-memory—optimize for speed, not perfection.

1. **Scaffold UI**
   - `npx create-next-app@latest jarvis-ui --ts`.
   - Replace the landing page with three cards: *Mood check-in*, *Today’s timeline* (mock list), *Insights* (static text).
2. **Local Storage Stub**
   - Add `src/lib/jarvisStore.ts` with a `useJarvisState` hook that persists to `localStorage`.
   - Shape the data as `JarvisState` (`mood`, `journal`, `todos`) so future backends can swap in.
3. **Client Components**
   - Mood slider (1–10) + textarea + submit button hitting the API.
   - Timeline list fed by hard-coded array for now.
   - Insights card showing “You checked in X days in a row” computed from JSON data.
4. **No Auth, No Calendars**
   - Hardcode a single `USER_ID = "demo"`.
5. **Quick Polish**
   - Add Tailwind via `npx tailwindcss init -p`.
   - Use a dark gradient background and glassy cards to hint at the final vibe.

Once this thin slice runs locally (`pnpm dev`), capture screenshots and iterate toward Supabase + Google integrations later.

### Current Working Slice

- Location: `apps/web`
- Stack: Next.js 16 + React 19 + Tailwind v4 + App Router client components.
- Storage: browser `localStorage` (`jarvis-state-v1`). Clear site data to reset.
- Features:
  - Sidebar-driven console with dedicated routes.
  - Dashboard: mood logging, blended timeline, quick journal, and streak insights.
  - Journal page: calendar heatmap + daily entry list with prompt-based logging.
  - Todos page: day selector, time-blocking, and upcoming block highlights.
  - Sleep page: track duration, quality, and dreams; feeds the timeline + averages.

Run it locally:

```bash
cd apps/web
npm install
npm run dev
```

Visit `http://localhost:3000`, log a few entries, and peek at `localStorage.jarvis-state-v1` in devtools to confirm persistence.

### Navigation Map

- `/` — Overview dashboard (mood + timeline + quick journal + suggestions).
- `/journal` — Calendar-based journal explorer with prompt-driven entry form.
- `/todos` — Mission planner with day selector, timeblocking, and upcoming cards.
- `/sleep` — Sleep quality tracker feeding averages + timeline badges.

## Core Experience Pillars

1. **Daily Check-in Flow**
   - Structured form with sliders (mood/energy/stress), sleep quality, tags, and gratitude/wins/friction notes.
   - Optional audio memo and photo attachment.
2. **Command Bar / Jarvis Panel**
   - Text or voice commands such as “log mood 7”, “schedule gym tomorrow at 6 pm”, “summarize last week”.
   - Starts rule-based, later enhanced with LLM intent parsing.
3. **Timeline + Calendar HUD**
   - Unified view of planned vs actual events, mood markers, and tags.
   - Drag tasks into open calendar slots; quick actions to block time or mark outcomes.
4. **Trends & Insights**
   - Mood vs sleep/activity charts, streaks, correlations, and threshold-based nudges.
   - Weekly digest generated via LLM summarizing highlights and suggested adjustments.
5. **Learning UI**
   - Widget weights adapt based on usage and outcomes (e.g., emphasize sleep insights when variance high).
   - Theme accent shifts with trailing mood average (glow/glass aesthetic inspired by Iron Man HUD).

## System Architecture

```
┌───────────────┐      ┌───────────────────┐      ┌────────────────────┐
│  Next.js App  │◄────►│  API / Orchestrator│◄────►│ Storage & Services │
└───────────────┘      └───────────────────┘      └────────────────────┘
       │                        │                           │
 React 19 + TS          Route handlers or Fastify     PostgreSQL / Supabase
 Tailwind + Framer      Background workers            Google Sheets mirror
 Radix UI               Auth + Google OAuth           LLM + Calendar APIs
```

### Frontend

- **Next.js 14 (App Router)** with React Server Components for fast dashboard loads.
- **TypeScript + Tailwind CSS + Radix UI** for composable, modern HUD-style components.
- **Framer Motion + CSS Grid** for subtle animations (command bar glow, mood ring pulse).
- **React Query** for server data; **Zustand** or Context for UI state (theme, widget weights).
- **Voice/Web Speech API** optional module for Jarvis-style vocal commands.

### Backend

- Default: **Next.js route handlers** (Edge-friendly) orchestrating Supabase/Postgres + Google APIs.
- Optional alternative: standalone **Django REST Framework** service if a Python stack is preferred; exposes the same REST/GraphQL contract so the frontend stays agnostic.
- Key endpoints:
  - `POST /api/check-ins`
  - `GET /api/timeline?date=YYYY-MM-DD`
  - `POST /api/calendar/block`
  - `GET /api/insights/weekly`
  - `POST /api/commands` (accepts structured command payload from chat panel)
- Background jobs (Supabase functions, Cloudflare Workers, or Celery if using Django) refresh insights, sync Google Calendar, and email/SMS nudges.

### Storage Strategy

| Requirement | PostgreSQL / Supabase | Google Sheets |
| --- | --- | --- |
| Structured analytics & joins | ✅ native SQL, RLS | ⚠️ via formulas/AppScript |
| Quick manual edits | ⚠️ via SQL client | ✅ familiar spreadsheet UX |
| Authentication | Supabase Auth / JWT | Sheet-sharing only |
| Backups & exports | Supabase auto backups | Google version history |

Implementation plan:
1. Use Supabase Postgres for primary storage + auth.
2. Define a storage interface (`StorageBackend`) and implement both `PostgresStorage` and `GoogleSheetsStorage`.
3. Nightly sync job to mirror critical tables into a Google Sheet for read-only personal analysis.

### Integrations & Intelligence

- **Google Calendar API** via OAuth for read/write events.
- **Google Sheets API** when the Sheet backend or mirror is active.
- **LLM layer** (OpenAI, Anthropic, or local) accessed through a server-side proxy for:
  - Weekly digests and tone-aware encouragement.
  - Translating natural language commands into structured actions.
- **Notification channels**: email (Resend), optional SMS (Twilio), and browser push.

## Data Model

| Entity | Fields |
| --- | --- |
| `users` | `id`, `google_id`, `display_name`, `preferences` (JSON), `timezone` |
| `check_ins` | `id`, `user_id`, `timestamp`, `mood_score` (-5…5), `energy`, `stress`, `sleep_hours`, `sleep_quality`, `wins`, `friction`, `gratitude`, `tags` (array) |
| `activities` | `id`, `user_id`, `source` (manual/calendar), `title`, `start`, `end`, `status`, `metadata` |
| `insights` | `id`, `user_id`, `period_start`, `period_end`, `summary`, `recommendations`, `stats` (JSON) |
| `ui_state` | `id`, `user_id`, `layout_preferences`, `widget_weights`, `theme_accent` |
| `sleep_logs` | `id`, `user_id`, `day`, `duration_mins`, `quality`, `dreams`, `notes` |

Google Sheets mirror uses tabs with matching schemas (Users, CheckIns, Activities, Insights, UIState, SleepLogs) to keep exports human-readable.

## UI Behavior & Visual System

- **Three-column layout**: Today Overview, Timeline, Insight Stack; collapses to stacked cards on mobile.
- **Mood ring**: 7-day moving average rendered with SVG gradient + blur; pulsates when new check-in logged.
- **Timeline cards**: highlight planned vs actual with color accent; include quick tags and voice-note playback.
- **Command bar**: docked bottom center; supports autocomplete for verbs (“log”, “schedule”, “summarize”) and can escalate to LLM when confidence low.
- **Adaptive theming**: accent gradient chosen from palette bank; automatically nudges toward calming tones when negative streak detected.

## Proposed Repository Structure

```
jarvis/
  apps/web/                # Next.js front-end
  apps/api/                # Optional standalone API service (Fastify or Django)
  packages/ui/             # Shared HUD components, icons, animations
  packages/config/         # ESLint, prettier, tailwind, tsconfig
  packages/db/             # Prisma schema + storage adapters
  docs/                    # Product briefs, prompt library, UX flows
  infra/                   # Terraform/Pulumi or Docker for Supabase + workers
```

Monorepo managed with **Turborepo** for shared lint/test pipelines and cached builds.

## Delivery Roadmap

1. **Foundation**
   - Bootstrap Turborepo, scaffold Next.js app with static cards and mocked data.
   - Configure Supabase project + `.env.example`.
2. **Mood & Timeline MVP**
   - Build check-in modal, mood ring, and timeline components.
   - Implement `POST /check-ins` + `GET /timeline` backed by Supabase.
3. **Calendar + Command Bar**
   - OAuth with Google, import events, allow creation of blocks via UI and command bar.
   - Implement rule-based intent parser for commands.
4. **Insights & Learning**
   - Nightly cron to compute stats + call LLM for summaries.
   - Persist widget usage metrics and reorder layout accordingly.
5. **Polish & Notifications**
   - Voice input, push/email nudges, advanced visual themes, Google Sheets sync/export.

## Immediate Next Steps

1. Run `pnpm dlx create-turbo@latest jarvis` (or `npx`) to scaffold the repo.
2. Commit the README plus `/docs` folder with detailed UX wireframes.
3. Stand up Supabase, generate Prisma schema, and seed with sample check-ins.
4. Build the check-in modal + mood ring using mocked data to prove the UI.
5. Document API contracts (`docs/api.md`) and smoke-test user flows with Playwright once the UI shell exists.

With this plan in place, you can now focus on iteratively building the Jarvis-style companion—starting from the daily check-in loop and layering in scheduling, intelligence, and adaptive UI behavior over time.
