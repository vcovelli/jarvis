# Jarvis Deployment Guide

Jarvis can run on a conventional Node.js host or a compatible managed Next.js platform. The core deployment requires Node.js 20.9+, PostgreSQL, stable secrets, Prisma migrations, and HTTPS. Optional integrations add network and filesystem requirements that may favor a persistent self-managed host.

## Preflight

- Node.js 20.9 or newer and npm
- A supported PostgreSQL database and credentials that can run migrations
- A public HTTPS origin for production authentication
- Persistent secret storage
- A database backup and restore plan
- Network access to any enabled providers

There is no Docker Compose or container image in the repository today.

## Environment configuration

Copy `apps/web/.env.example` to `.env` for local development. In production, use the platform’s secret manager rather than committing an environment file.

### Required core values

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. |
| `NEXTAUTH_URL` | Canonical app origin, such as `https://jarvis.example.com`. |
| `NEXTAUTH_SECRET` | Stable, high-entropy signing secret. Generate with `openssl rand -base64 32`. |

### Registration controls

| Variable | Default behavior | Purpose |
| --- | --- | --- |
| `REGISTRATION_DISABLED` | `false` | Set `true` to reject all new registrations. |
| `REGISTRATION_ACCESS_CODE` | empty | When non-empty, registration requires this exact shared code. |

`REGISTRATION_DISABLED=true` takes precedence over the access code. Existing users can still sign in.

### Assistant and voice

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | unset | Enables transcription fallback and model-assisted fuzzy intent parsing. |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Model sent to the transcription endpoint. |
| `OPENAI_INTENT_MODEL` | `gpt-5` | Model used after deterministic intent parsing needs help. |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | WebSocket gateway for general chat. HTTP(S) input is normalized to WS(S). |
| `OPENCLAW_GATEWAY_TOKEN` | config-file token or unset | Preferred gateway bearer credential. |
| `OPENCLAW_GATEWAY_PASSWORD` | unset | Optional gateway password. |
| `OPENCLAW_GATEWAY_ROLE` | `operator` | Gateway connection role. |
| `OPENCLAW_AGENT_ID` | `main` | Agent used for assistant chat. |
| `OPENCLAW_SESSION_PREFIX` | `agent:main:jarvis` | Prefix for per-conversation session keys. |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | Base directory for local OpenClaw config and device identity. |
| `OPENCLAW_CONFIG_PATH` | `<state-dir>/openclaw.json` | Optional explicit OpenClaw config path. |
| `OPENCLAW_DEVICE_IDENTITY_PATH` | `<state-dir>/identity/device.json` | Optional explicit device identity path. |

`OPENCLAW_SESSION_KEY` exists as an advanced single-session override in the low-level client, but normal assistant conversations use persisted per-conversation keys and `OPENCLAW_SESSION_PREFIX`.

### Finance

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAID_ENV` | `sandbox` | `sandbox`, `development`, or `production`. |
| `PLAID_CLIENT_ID` | unset | Plaid client identifier. |
| `PLAID_SECRET` | unset | Secret for the selected Plaid environment. |
| `PLAID_COUNTRY_CODES` | `US` | Comma-separated country codes. |
| `PLAID_WEBHOOK_URL` | unset | Optional webhook URL supplied to Link; webhook handling is not implemented yet. |
| `PLAID_REDIRECT_URI` | unset | Optional OAuth redirect URI registered with Plaid. |
| `FINANCIAL_DATA_KEY` | `NEXTAUTH_SECRET` | AES-256-GCM key material for encrypted provider tokens. Prefer 64 hex characters from `openssl rand -hex 32`. |

Keep `FINANCIAL_DATA_KEY` stable. Changing it makes existing encrypted Plaid tokens unreadable and requires users to reconnect.

### Real estate

| Variable | Default | Purpose |
| --- | --- | --- |
| `RENTCAST_API_KEY` | unset | Enables authenticated live listing searches. |
| `RENTCAST_MONTHLY_LIMIT` | `50` | Expected monthly provider allowance. |
| `RENTCAST_MONTHLY_RESERVE` | `5` | Requests held back from Jarvis. |
| `RENTCAST_CACHE_TTL_HOURS` | `24` | Filesystem/memory listing-cache lifetime. |

The effective hard cap is `monthly limit - reserve`. Usage and cached listings live under `apps/web/.rentcast-cache` at runtime. That local ledger is process-host specific, not a distributed quota service. On serverless or multi-instance deployments, use demo mode or replace it with shared durable rate limiting before relying on the cap.

### Homelab

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOMELAB_DOCS_ROOT` | `/home/vcovelli/homelab-docs` | Readable root for the in-app Markdown browser and snapshots. |
| `PROMETHEUS_BASE_URL` | `http://127.0.0.1:9090` | Prometheus endpoint queried by the server. |
| `GRAFANA_BASE_URL` | `http://100.115.58.56:3001` | Base link shown for Grafana. |

Override the machine-specific defaults outside the original homelab. The application process needs read access to `HOMELAB_DOCS_ROOT` and network access to Prometheus; a typical serverless platform cannot see local homelab files or loopback services.

## Local installation

From the repository root:

```bash
cd apps/web
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Open `http://localhost:3000`, register, and verify that a new entry reaches **Synced** in the shell.

Use `npx prisma migrate dev --name <description>` only when intentionally creating a new schema migration. Do not create a new “init” migration for an existing checkout.

## Production build and start

A conventional host can deploy with:

```bash
cd apps/web
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm run start
```

The `start` script listens on `127.0.0.1:3000`. Put Nginx, Caddy, or another HTTPS reverse proxy on the public interface. Forward the original host and protocol so `NEXTAUTH_URL`, callback URLs, and secure cookies agree with the browser-visible origin.

Run `prisma:migrate:deploy` once per release before the new application version serves requests. Do not use `prisma migrate dev` in production.

## Managed platform notes

A managed Next.js platform can host the core UI and database-backed features when it supports the app’s Node.js runtime and Prisma lifecycle. Configure the project root as `apps/web`, use `npm run build`, and run production migrations in a controlled release step.

Review optional features before choosing serverless hosting:

- OpenClaw requires outbound WebSocket access and can stream for up to the assistant timeout.
- Homelab docs require a local readable filesystem tree.
- Prometheus may be reachable only on a private network.
- RentCast’s current cache/quota ledger expects a persistent, single-host working directory.

The core daily workspace, auth, Postgres state, and demo experiences do not require those integrations.

## Verification

Before deployment:

```bash
cd apps/web
npm run verify
```

This runs lint, the configured Node tests, and a production build. Then perform browser smoke tests against the deployed origin:

1. Registration behavior matches the configured gate.
2. Login, sign-out, password change, and session redirect work.
3. Create and delete a mood, custom mood tag, todo, and habit log.
4. Refresh and confirm the shell returns to **Synced** without deleted data reappearing.
5. Check Home and Plan on a narrow and tall phone viewport.
6. Navigate once with every mobile bottom-bar item and confirm icon/label state updates immediately.
7. Check Light, Dark, and High Contrast with all four palettes.
8. Exercise only the external integrations enabled in that environment.
9. Confirm account deletion in a disposable test account.

## Backups and recovery

The PostgreSQL backup is the durable backup for users, daily workspace state, finance history, assistant conversations, and assistant memory. Define:

- automated backup frequency and retention
- encrypted off-host storage
- a restore command and named owner
- periodic restore drills into a non-production database
- recovery-point and recovery-time targets

Theme choice, shell preferences, and some view preferences live only in browser storage. RentCast cache files are disposable. Back up the external homelab documentation repository separately if it matters operationally.

Before a destructive schema change, take a verified database backup. Roll back application code only to a version compatible with the already-applied schema; Prisma migrations are forward operations and should not be casually reversed.

## Operations and hardening

- Terminate TLS at the proxy or platform edge.
- Keep all secrets out of logs and client bundles.
- Keep registration closed or access-code gated for controlled deployments.
- Monitor authentication errors, state 409/5xx responses, assistant failures, finance sync failures, and provider quota errors.
- Apply request/body limits and rate limiting at the edge while application-level controls remain incomplete.
- Alert on database capacity and failed backups.
- Review dependency and database security updates on a release cadence.

See [deployment readiness](./deployment-readiness.md) for blockers to open paid signup and a supported self-host product.
