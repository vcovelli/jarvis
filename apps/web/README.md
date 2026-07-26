# Web app README

This is the web application for Jarvis. It is a Next.js app using the App Router, TypeScript, Prisma, and NextAuth.

## Quick start

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000.

## Required environment variables

Create an environment file from the example and fill in the values:

```bash
cp .env.example .env
```

Required variables:

- DATABASE_URL
- NEXTAUTH_URL
- NEXTAUTH_SECRET

Optional integration variables:

- OPENAI_API_KEY enables server transcription when the browser cannot do speech recognition directly.
- OPENAI_TRANSCRIPTION_MODEL defaults to `gpt-4o-mini-transcribe`.
- PLAID_ENV, PLAID_CLIENT_ID, and PLAID_SECRET enable Plaid Link in the finance dashboard.
- PLAID_PRODUCTS defaults to `transactions,investments`; add `liabilities` later if Plaid access is approved and the UI is extended for debts.
- PLAID_COUNTRY_CODES defaults to `US`.
- FINANCIAL_DATA_KEY encrypts Plaid access tokens at rest. Use a stable 64-character hex value from `openssl rand -hex 32`.

## Main areas

- dashboard and daily check-in
- journal
- todos and planning
- sleep logging
- review and reflections
- account and auth flows


## Progressive web app install

Jarvis is configured as an installable web app with a manifest, standalone display mode, mobile theme colors, and Home Screen icons. The installed app starts at `/v2` and removes the normal browser URL and navigation chrome when launched from the Home Screen.

- Android Chrome: open Jarvis in Chrome, tap the three-dot menu, then tap **Add to Home screen** or **Install app**. Launch Jarvis from the new Home Screen icon.
- iPhone or iPad: Safari is the most reliable path. Open Jarvis in Safari, tap Share, tap **Add to Home Screen**, keep **Open as Web App** enabled if shown, then tap **Add**.
- Chrome on iPhone may expose Add to Home Screen through the iOS share sheet on newer iOS versions, but Safari is still the cleanest install path to verify first.

## Voice and finance integrations

Voice action starts from the center mic in the mobile bottom bar or the Assistant page. The browser Speech Recognition API is used first for fast command capture. If the browser does not support it, Jarvis records a short audio clip and posts it to `/api/assistant/transcribe`, which uses OpenAI when `OPENAI_API_KEY` is configured. The transcript is routed through the existing assistant command flow, so voice-created items still show the normal confirmation card before they are saved.

Finance data is intentionally separate from the local-first Jarvis state blob. Plaid access tokens are stored only on the server in `FinancialConnection.accessTokenEncrypted`, protected by `FINANCIAL_DATA_KEY` or `NEXTAUTH_SECRET`. Accounts, transactions, and investment holdings sync into dedicated Prisma tables and are exposed through `/api/finance/summary`. The first version is read-only: Jarvis can connect, sync, display, and analyze data, but it cannot move money.

Before using Plaid locally, run the finance migration and regenerate Prisma:

```bash
npx prisma migrate dev --name finance_foundation
npx prisma generate
```

## State persistence

Jarvis state is managed in `src/lib/jarvisStore.ts` and persisted in two layers:

- Local browser cache: every hydrated state change writes the full sanitized state to `localStorage` under a user-specific key. UI preferences, such as planner day and planner view mode, use separate localStorage keys.
- Authenticated server sync: signed-in users also sync the same state to `/api/state`, backed by Prisma `UserState`. Saves are pushed immediately after local cache writes, retried when the browser comes back online, and flushed with a best-effort beacon or keepalive request when the tab is hidden or closed.

Each local snapshot has metadata with its ETag, local save time, remote sync time, and whether a remote save is pending. During startup, a pending local snapshot wins over older server data so recently entered app data is not replaced by stale remote state. Once the server confirms the same ETag, the pending flag is cleared.

The v2 shell displays the current save status: loading, saving soon, saving, synced, saved locally, or save issue.

## Related documentation

- [../../README.md](../../README.md) — repository overview
- [../../docs/usage.md](../../docs/usage.md) — how to use the app
- [../../docs/architecture.md](../../docs/architecture.md) — implementation details
- [../../docs/deployment.md](../../docs/deployment.md) — deployment guidance
