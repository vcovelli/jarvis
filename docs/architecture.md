# Jarvis Architecture Guide

Jarvis is a full-stack Next.js application with an authenticated React workspace, a local-first state layer, server APIs, Prisma, and PostgreSQL. It deliberately uses two persistence models: one JSON document for fast-changing daily-life data and relational tables for sensitive or query-heavy assistant and finance data.

## System map

```text
Browser / installed PWA
  ├─ public landing, login, and registration
  └─ authenticated /v2 shell
       ├─ React feature pages and shared components
       ├─ JarvisStateProvider → user-scoped localStorage cache
       ├─ theme runtime → data-theme + data-palette
       └─ authenticated /api routes
            ├─ UserState JSON sync with ETag conflict checks
            ├─ assistant conversations, memory, intent, and OpenClaw
            ├─ finance sync, normalization, review, and summaries
            ├─ real-estate listing provider
            └─ homelab docs and Prometheus summaries
                         ↓
                  Prisma / PostgreSQL
```

## Application structure

The deployable app lives in `apps/web`.

```text
apps/web/
├── prisma/
│   ├── schema.prisma          # Relational source of truth
│   └── migrations/            # Versioned database changes
├── public/icons/              # PWA icons
└── src/
    ├── app/                   # App Router pages, layouts, manifest, and APIs
    ├── components/            # Shell and reusable UI
    ├── lib/                   # State, auth, themes, analytics, and integrations
    └── types/                 # Shared type augmentation
```

The root page is a public landing page and redirects an already authenticated user to `/v2`. The `/v2` layout calls `getServerSession`; unauthenticated requests are redirected to `/login` before the workspace renders.

`src/app/v2/layout.tsx` composes the first-run walkthrough, pull-to-refresh behavior, grouped sidebar/mobile navigation, `PageViewport`, and `JarvisStateProvider`. `/v2/daily` is an alias of the planner implementation at `/v2/todos`.

## Routes and product maturity

| Group | Routes | State |
| --- | --- | --- |
| Start | `/v2`, `/v2/daily`, `/v2/assistant` | Active |
| Daily rhythm | `/v2/must-win`, `/v2/habits`, `/v2/mood`, `/v2/journal`, `/v2/sleep` | Active |
| Growth | `/v2/objectives`, `/v2/review` | Active |
| Growth briefs | `/v2/focus`, `/v2/fitness`, `/v2/career` | Informational briefs |
| Resources | `/v2/finance`, `/v2/real-estate`, `/v2/homelab`, `/v2/documentation` | Active, with optional integrations |
| Account | `/v2/settings`, `/v2/account` | Active |
| Deployment-specific | `/v2/manufacturing` | Informational brief, not in primary navigation |

## Daily-life state

`src/lib/jarvisStore.ts` defines `JarvisState`, its reducer, sanitization, demo data, persistence, and public actions. The document contains:

- moods plus deletion tombstones
- custom mood tags plus tag-deletion tombstones
- journal entries
- todos plus deletion tombstones
- sleep entries and schedule presets
- operating mode and Must Win records
- habits and daily logs
- daily and weekly reviews
- objectives and nested projects
- bounded homelab action history

Tombstones are important: merges must not restore a mood, custom mood tag, or todo that a user deleted on another device.

### Local and remote flow

1. The provider hydrates a user-specific `localStorage` snapshot.
2. UI actions update the reducer and write a sanitized local copy.
3. Authenticated state is queued to `/api/state`.
4. The API stores one `UserState.state` JSON document per `userId`.
5. ETags identify the server version. GET supports `If-None-Match`; writes use `If-Match` or `baseEtag`.
6. A stale write receives HTTP 409 and the current server state so the client can merge safely.
7. Pending state retries after connectivity returns and uses a best-effort keepalive/beacon when the document is hidden or closed.

Demo mode has its own generated reducer state and never sends demo mutations to the real workspace API.

## Relational data

The Prisma schema separates four concerns.

### Identity

- `User`
- `Account`
- `Session`
- `VerificationToken`

Credentials users store a bcrypt password hash. NextAuth uses JWT sessions; adapter models remain available for provider/session compatibility.

### Daily workspace

- `UserState` — one JSON document per user

### Finance

- `FinancialConnection` — provider item and encrypted access token
- `FinancialAccount`
- `FinancialTransaction`
- `InvestmentHolding`
- `FinancialEvent` — normalized, classified cash-flow event
- `FinancialClassificationRule`
- `ManualFinancialPosition`
- `ManualFinancialPositionValuation`
- `FinancialAccountBalanceSnapshot`
- `FinancialNetWorthSnapshot`

Provider access tokens are encrypted before storage with `FINANCIAL_DATA_KEY`, falling back to `NEXTAUTH_SECRET`. Finance responses expose dashboard data, not provider access tokens.

### Assistant

- `AssistantConversation`
- `AssistantMessage`
- `AssistantMemory`

Every domain record is owned by `userId`, and child records cascade or detach according to the relationships declared in `schema.prisma`.

## API surface

All workspace mutation and sensitive-data APIs derive the user from the server session. Important routes are:

| Area | Endpoint | Methods | Responsibility |
| --- | --- | --- | --- |
| Auth | `/api/auth/[...nextauth]` | NextAuth handlers | Login, JWT session, sign-out callbacks |
| Auth | `/api/auth/register` | POST | Controlled credentials registration |
| Account | `/api/account` | DELETE | Delete the signed-in user |
| Account | `/api/account/password` | PATCH | Change the current password |
| State | `/api/state` | GET, PUT, POST | Fetch and conditionally save `UserState` |
| Assistant | `/api/assistant/conversations` | GET, POST | List or create conversations |
| Assistant | `/api/assistant/conversations/:id` | GET, PATCH | Read or update a conversation |
| Assistant | `/api/assistant/memory` | GET, POST | Read or upsert memory |
| Assistant | `/api/assistant/intent` | POST | Resolve structured intent |
| Assistant | `/api/assistant/message` | POST | Route actions/status/finance; stream OpenClaw chat |
| Assistant | `/api/assistant/transcribe` | POST | OpenAI audio transcription fallback |
| Finance | `/api/finance/plaid/link-token` | POST | Create a scoped Plaid Link token |
| Finance | `/api/finance/plaid/exchange` | POST | Exchange and encrypt a public token |
| Finance | `/api/finance/sync` | POST | Sync accounts, transactions, holdings, and snapshots |
| Finance | `/api/finance/summary` | GET | Return the read-only analytics view |
| Finance | `/api/finance/events/:id` | PATCH | Review/reclassify an event |
| Finance | `/api/finance/classification-rules` | GET, POST | List or create user rules |
| Finance | `/api/finance/manual-positions` | GET, POST | List or record manual positions |
| Finance | `/api/finance/connections/:id` | DELETE | Remove a connection and its scoped records |
| Real estate | `/api/real-estate/listings` | GET | Return demo listings or an authenticated live search |
| Homelab | `/api/homelab/snapshot`, `/api/homelab/summary` | GET | Return filesystem-backed operational context |
| Monitoring | `/api/monitoring/summary` | GET | Return the Prometheus-derived summary |

The demo listing endpoint can return built-in public data, but a live provider request requires a session. Treat that exception deliberately when changing route guards.

## Assistant routing

Assistant input follows this order:

1. Ensure a user-owned conversation and persist the user message.
2. Resolve structured intent using local parsing, with optional OpenAI fuzzy parsing.
3. Route recognized data actions to a confirmation-oriented result.
4. Answer Jarvis/homelab status requests from server-side snapshot sources.
5. Answer finance questions from server-side analytics, or generated finance data in demo mode.
6. Send general conversation to OpenClaw and stream Server-Sent Events (`conversation`, `accepted`, `delta`, `final`, or `error`).
7. Persist the response, update the conversation summary, and maintain derived memory.

The browser attempts native speech recognition first. Unsupported browsers upload a recorded blob to `/api/assistant/transcribe`; that endpoint requires `OPENAI_API_KEY`.

## External integrations

- **OpenClaw:** optional WebSocket gateway for general assistant chat.
- **OpenAI:** optional transcription and fuzzy intent parsing; deterministic intent parsing remains available without it.
- **Plaid:** optional read-only bank, card, transaction, and investment ingestion.
- **RentCast:** optional live real-estate listings with a local monthly request guard and cache.
- **Prometheus/Grafana:** optional homelab metrics and links.
- **Homelab docs:** optional filesystem tree rooted at `HOMELAB_DOCS_ROOT`.

Integration failures should remain isolated. A missing optional service must produce an explicit setup or unavailable state, not crash unrelated daily modules.

## Theme and shell architecture

`src/lib/theme.ts` treats foundation (`light`, `dark`, `contrast`) and palette (`ocean`, `forest`, `rose`, `violet`) as independent values. It applies them through root data attributes, browser storage, and a same-tab custom event. `src/app/globals.css` maps those attributes to semantic surface, text, status, and control rules.

The shell has one internal scroll region. `PageViewport` supplies shared safe-area and route-top behavior; the Sidebar supplies desktop groups, mobile bottom navigation, save status, and theme controls. See [UI and theming](./ui-and-theming.md) before changing global styling.

## Security boundaries

- Never send provider tokens or encryption keys to client components.
- Derive resource ownership from `session.user.id`; do not accept an arbitrary user id from request bodies.
- Preserve private/no-store caching on personal state and sensitive summaries.
- Keep registration gates enforced server-side.
- Keep finance write capabilities out of scope unless the security model is explicitly redesigned.
- Validate external URLs, request limits, payload sizes, and provider errors at API boundaries.

Current known launch gaps are recorded in [deployment readiness](./deployment-readiness.md).

## Change map

- Feature state or merge behavior → `src/lib/jarvisStore.ts`
- Page UI → `src/app/v2/<feature>`
- Shared navigation or shell controls → `src/components/Sidebar.tsx`
- Shared viewport spacing → `src/components/PageViewport.tsx`
- Theme selection → `src/lib/theme.ts`
- Theme tokens and compatibility → `src/app/globals.css`
- Authentication → `src/lib/auth.ts` and auth/account routes
- Database ownership and migrations → `prisma/schema.prisma` and `prisma/migrations`
- Finance → `src/lib/finance*`, `src/lib/finance/`, and finance routes
- Assistant → `src/lib/assistant/`, `src/lib/openclaw/`, and assistant routes
- Real estate → `src/lib/realEstate/` and the listing route
- Homelab → `src/lib/homelabDocs.ts`, `src/lib/prometheus.ts`, and homelab/monitoring routes
