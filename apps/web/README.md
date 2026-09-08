# Jarvis Web Application

This directory contains the deployable Jarvis OS application: a Next.js 16 App Router project using React 19, TypeScript, Tailwind CSS 4, NextAuth, Prisma 5, and PostgreSQL.

## Requirements

- Node.js 20.9 or newer
- npm
- PostgreSQL

## Start locally

```bash
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Set the three required values in `.env` first:

```dotenv
DATABASE_URL="postgres://user:password@localhost:5432/jarvis"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-long-random-string"
```

Open [http://localhost:3000](http://localhost:3000). The public landing page sends authenticated users to `/v2`; direct `/v2` requests send unauthenticated users to `/login`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run lint` | Run ESLint. |
| `npm test` | Run the configured finance-classification and registration tests. |
| `npm run build` | Create a production Next.js build. |
| `npm run start` | Serve the build on `127.0.0.1:3000`. |
| `npm run prisma:generate` | Regenerate Prisma Client. |
| `npm run prisma:migrate:deploy` | Apply committed migrations in production. |
| `npm run config:validate -- --production` | Validate required production variable names and formats without printing values. |
| `npm run invite:create -- --email=user@example.com --days=7` | Create a hashed, single-use registration invite. |
| `npm run verify` | Run lint, tests, and the production build. |

Use `npx prisma migrate dev --name <description>` only when creating a deliberate schema change. Existing installations should apply the committed migration history.

## Project map

```text
prisma/
  schema.prisma              relational models
  migrations/                versioned database changes
public/icons/                PWA and Home Screen artwork
src/app/
  api/                       server route handlers
  v2/                        authenticated product routes
  layout.tsx                 metadata, providers, and global CSS
  manifest.ts               installable PWA manifest
src/components/              shell and reusable UI
src/lib/
  jarvisStore.ts             local-first daily state and synchronization
  theme.ts                   foundation/palette preference runtime
  assistant/                 intent routing, conversations, and memory
  finance/                   classification, normalization, and analytics
  openclaw/                  general-chat gateway client
  realEstate/                provider, demo data, and calculations
  homelabDocs.ts             filesystem documentation/snapshot adapter
  prometheus.ts              monitoring adapter
```

## Product routes

- Start: `/v2`, `/v2/daily`, `/v2/assistant`
- Daily rhythm: `/v2/must-win`, `/v2/habits`, `/v2/mood`, `/v2/journal`, `/v2/sleep`
- Growth: `/v2/objectives`, `/v2/review`, plus Focus/Fitness/Career briefs
- Resources: `/v2/finance`, `/v2/real-estate`, `/v2/homelab`, `/v2/documentation`
- Account: `/v2/settings`, `/v2/account`

`/v2/daily` re-exports the planner at `/v2/todos`. `/v2/manufacturing` remains a deployment-specific brief and is intentionally absent from the primary navigation.

## Configuration

[`./.env.example`](./.env.example) is the canonical variable template. Optional groups are:

- Registration/auth: registration mode/access code, email verification/mail relay, trusted proxy headers, and development token exposure
- Operations: internal job secret, admin emails, and rate-limit profile overrides
- OpenAI: `OPENAI_API_KEY`, `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_INTENT_MODEL`
- OpenClaw: gateway URL/credentials, agent, session prefix, and optional local config/device paths
- Plaid: environment, credentials, country codes, webhook metadata, and redirect URI
- Finance encryption: `FINANCIAL_DATA_KEY`
- RentCast: API key, monthly budget/reserve, and cache TTL
- Homelab: docs root, Prometheus URL, and Grafana URL

Core daily modules run without the optional integrations. Finance and Real Estate provide explicit setup/demo states; general assistant chat reports an unavailable OpenClaw gateway; homelab views depend on the host’s files and network.

See [deployment.md](../../docs/deployment.md) for every variable, default, hosting constraint, and production command.

## Persistence boundaries

### Daily workspace

`src/lib/jarvisStore.ts` keeps mood, journal, todos, sleep, Must Win, habits, reviews, objectives, custom mood tags, and homelab actions in one sanitized `JarvisState` document.

- A user-scoped `localStorage` copy makes interaction immediate.
- `/api/state` persists the authenticated copy in Prisma `UserState`.
- ETags and conditional writes detect cross-device conflicts.
- Pending writes retry after reconnect and get a best-effort page-hide flush.
- Deletion tombstones stop moods, mood tags, and todos from returning during merges.
- Demo mode uses isolated generated state and skips real-state persistence.

The shell exposes loading, saving, synced, local-only, and error status plus manual refresh.

### Finance and assistant

Finance does not live in the JSON state document. Connections, encrypted provider tokens, accounts, transactions, holdings, normalized events, rules, manual positions, and snapshots use dedicated Prisma tables. The system is read-only with respect to external accounts.

Assistant conversations, messages, and memory also use dedicated tables. Structured daily actions flow back through the client’s confirmation UI before changing `JarvisState`.

## Assistant behavior

The Assistant page is the center item in the mobile navigation; voice starts from the microphone control inside the page.

1. Browser speech recognition is attempted when available.
2. Otherwise `MediaRecorder` audio can be posted to `/api/assistant/transcribe` when OpenAI is configured.
3. Typed or transcribed text enters the shared intent layer.
4. Deterministic parsing handles common commands; `/api/assistant/intent` can use OpenAI for fuzzy input.
5. Structured changes produce a draft/confirmation flow.
6. Status and finance questions use Jarvis server data.
7. General chat streams from an optional OpenClaw gateway.

See [docs/voice-finance-roadmap.md](./docs/voice-finance-roadmap.md) for current limitations and next work.

## Finance behavior

Plaid connection modes request only the relevant products:

- Bank / Credit Card → `transactions`
- Investment Account → `transactions,investments`

Tokens are encrypted server-side with `FINANCIAL_DATA_KEY`, falling back to `NEXTAUTH_SECRET`. Never expose either key or an access token to a client component. The finance dashboard supports synchronization, analytics, manual positions, event review, stored classification rules, and assistant questions; it cannot move money or place trades.

`/api/finance/plaid/webhook` verifies Plaid's signed JWT and exact body hash, stores an idempotency key, and syncs only matching user-owned items. `/api/internal/finance-sync` is protected by `INTERNAL_JOB_SECRET`; database leases prevent overlapping global and per-connection runs. The repository supplies `scripts/finance-sync.sh` but does not install a scheduler.

## Deployment-security foundation

- Password reset and optional email verification use hashed, expiring, single-use tokens and a provider-neutral mail relay.
- Password change/reset and **Sign out everywhere** invalidate previous JWT sessions through `User.sessionVersion`.
- High-risk routes have per-IP and authenticated per-user limits with 429/`Retry-After`; the default store is single-process and replaceable.
- Account includes a redacted portable JSON export and password-confirmed deletion with best-effort Plaid revocation.
- `AuditLog`, `Entitlement`, `RegistrationInvite`, `ExternalWebhookEvent`, and `JobLease` support security and operations without enabling billing or feature lockout.
- `/api/health` provides liveness; `/api/ready` checks core configuration and PostgreSQL.

See the [deployment and recovery runbook](../../docs/deployment.md) before applying the additive security migration or restarting a service.

## Progressive web app

`src/app/manifest.ts` configures Jarvis as a standalone portrait-oriented PWA starting at `/v2`. Icons live in `public/icons`. Mobile layout reserves safe-area and bottom-navigation space.

- Android/Chrome: use **Install app** or **Add to Home screen**.
- iPhone/iPad: use Safari’s **Share → Add to Home Screen** flow.

The installed app checks the no-cache `/api/version` runtime marker on launch, resume, reconnect, and back/forward restoration. When the server runtime changes, Jarvis first attempts a workspace sync, explains that an update is ready, and reloads the standalone app. Session and workspace state also refresh on resume and reconnect.

Mobile pull-to-refresh is embedded in the page scroller. It follows the gesture and reports pull, release, checking, success, and failure states. A separate mobile status notice explains workspace opening, local saves, server synchronization, offline safety, retry needs, and completion. Desktop retains the browser's native refresh workflow.

Jarvis does not currently register a custom offline service worker. Installation and local-first editing should not be described as complete offline application support.

## UI contract

Theme foundation (`light`, `dark`, `contrast`) and palette (`ocean`, `forest`, `rose`, `violet`) are independent. Use semantic theme primitives from `globals.css`; do not add a page-specific navy background or hardcoded icon color. `PageViewport` owns shared route spacing and scroll reset behavior.

Read [UI and theming](../../docs/ui-and-theming.md) before modifying global surfaces, controls, navigation, or responsive layout.

## Before opening a pull request

1. Keep unrelated worktree changes intact.
2. Update the relevant documentation with behavior changes.
3. Add or update tests for non-trivial data and authorization logic.
4. Run `npm run verify`.
5. Smoke-test mobile navigation, local/server sync, and representative theme combinations for UI changes.

## Related documentation

- [Repository overview](../../README.md)
- [Documentation hub](../../docs/README.md)
- [Usage guide](../../docs/usage.md)
- [Architecture](../../docs/architecture.md)
- [Deployment](../../docs/deployment.md)
- [Deployment readiness](../../docs/deployment-readiness.md)
