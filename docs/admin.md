# Jarvis Control

Admin is available to active ADMIN and OWNER entitlements at `/v2/admin`, under Account in the desktop sidebar and mobile More menu. The primary bottom navigation is unchanged. Ordinary accounts cannot load the page or its APIs, regardless of rollout level. Anonymous pages redirect to login; unauthorized pages use the existing not-found behavior. APIs return 401/403 and never rely on a visible navigation link for authorization.

## Access and rollout

The existing Entitlement model remains the authority: FREE, INVITED, PRO, ADMIN, and the new highest tier OWNER. ADMIN can inspect system status, users, and activity. OWNER can change user entitlement and rollout from a user detail screen. Rollout is independent and defaults to STABLE for every existing/new user:

- STABLE: normal production experience.
- BETA: upcoming functionality ready for trusted testing.
- EXPERIMENTAL: newest functionality, which may be unfinished.

Owners can set their own rollout to EXPERIMENTAL. Nobody can change their own entitlement through Admin. At least one active owner must remain. Owner accounts cannot delete themselves; another owner must change their entitlement first. Only active, non-expiring entitlements can become OWNER. Entitlement expiry/status remains visible and is preserved by edits; no new account suspension/deletion controls are added.

`JARVIS_ADMIN_EMAILS` retains its existing server-side ADMIN behavior using the account email read from the database. These override-managed entitlements cannot be edited from the web UI. The override never grants OWNER. The first owner is assigned manually using the operator command below; the command refuses when any OWNER already exists. No hardcoded client email or second role system exists.

Every API independently checks the live database entitlement. Mutations additionally verify same-origin JSON, validate an allowlist of fields, then reload actor/target authorization under a shared PostgreSQL transaction lock. Changes and their AuditLog entry commit together or both roll back. Activity shows only selected operational events and sanitized value changes; no raw metadata, IP addresses, credentials, or provider payloads are sent to Admin clients. User responses also use explicit field projections. Audit history now survives account deletion with a nullable actor relation.

## Screens and operations

- Overview: app/version, deployment readiness, process uptime, users and rollout counts, important alerts, recent activity, and optional integration statuses.
- Users: search by email/name/exact ID, 30 per page, responsive rows/cards, then a detail page with access and rollout controls.
- Activity: the latest 40 meaningful registration/security/account, failed-sync, and administrative events; the overview displays five on phones and up to ten on desktop.

Account last activity is updated conditionally at most once every 15 minutes, including across workers. Existing session checks supply activity and visible clients refresh their session every 15 minutes. The UI distinguishes active recently (30 minutes), today (24 hours), this week, and older. Previously unused accounts show Unavailable until activity occurs. This is an approximate timestamp, not a detailed behavior log or live online count.

App health and database readiness reuse the same helpers as `/api/health` and `/api/ready`. OpenClaw reuses its bounded health probe. Homelab checks the configured documentation source, not every monitored service. Finance Sync uses existing audit events, active connections, job configuration, a 24-hour freshness window, and recent failures. Missing optional configuration is neutral. Plaid/OpenAI/RentCast report configuration presence and Unavailable live health until there is a supported probe; merely setting a key is not a health check. No billable provider request, connection flow, sync job, or chat is triggered by opening Admin.

Build information is centralized: optional `APP_VERSION`, `GIT_COMMIT_SHA`, and ISO `BUILD_TIMESTAMP`; version falls back to package.json, absent commit/timestamp to Unavailable, environment to NODE_ENV. `/api/version` preserves its existing runtime marker for PWA refresh behavior. No new environment variable is required.

## Feature foundation

`FeatureFlag` stores a key and stage: STABLE, BETA, EXPERIMENTAL, or OFF. It starts empty; no fake product feature is seeded or enabled. Server code calls `hasFeature(authenticatedUserId, featureKey)` from `src/lib/features.ts` before serving the relevant feature. STABLE allows all three rollout levels; BETA allows BETA/EXPERIMENTAL; EXPERIMENTAL allows only EXPERIMENTAL; OFF, missing users, and unknown keys deny access. ADMIN/OWNER has no bypass. Keep entitlement/ownership checks in addition to feature evaluation. No client-only visibility check substitutes for server enforcement.

## Manual installation

Take the normal database backup and follow your deployment maintenance procedure. These commands are provided for the operator; the implementation does not execute them against production.

```bash
cd ~/projects/jarvis/apps/web
npm ci
npx prisma validate
npx prisma generate
npm run verify
npx prisma migrate deploy
npm run owner:bootstrap -- --user-id=YOUR_EXISTING_USER_ID
```

The additive migration is `20260908120000_owner_admin_control_plane`. It adds User.rolloutLevel (STABLE default), User.lastActiveAt, indexes, an empty FeatureFlag table, and changes the AuditLog user foreign key to SET NULL so history is retained. It does not modify old migrations, reset users, or grant privileges. Apply it before running the new application version. To find your exact account ID before bootstrap, use the `id` field in your own account export or your normal trusted database administration tool.

Only after successful migration/build, manually switch/restart the app using your normal deployment procedure. For the existing PM2 installation, the manual restart command is:

```bash
pm2 restart "${JARVIS_PM2_NAME:-jarvis}" --update-env
curl --fail --silent --show-error "${JARVIS_BASE_URL:-http://127.0.0.1:3000}/api/health"
curl --fail --silent --show-error "${JARVIS_BASE_URL:-http://127.0.0.1:3000}/api/ready"
```

No production migration, PM2 restart, deployment, or production environment change is performed by this task. The production build uses `tsconfig.build.json` to exclude stale `.next/dev` route validators; development retains its own generated types.


## Verification

Validated in an independent application copy with synthetic configuration and a disposable PostgreSQL database; production data and build artifacts were not used or changed:

- Prisma schema validation and client generation passed.
- `npm run verify` passed: ESLint, all 55 tests (nine new Admin policy tests), and the optimized production build.
- The production build passed with a deliberately stale development validator importing the deleted Career page still present under `.next/dev/types`.
- The opt-in `scripts/test-admin-integration.mjs` passed 65 real HTTP checks, including unauthenticated/ordinary/BETA/EXPERIMENTAL denial, ADMIN/OWNER reads, owner-only writes, same-origin validation, self-promotion/field injection rejection, database-backed email overrides, audit rollback on failure, concurrent owner demotions, owner account deletion protection, sensitive-field filtering, activity throttling, and audit retention.
- Browser checks passed all four Admin screens at 320, 390, 768, 1024, and 1440 pixels in Chromium, plus phone portrait/landscape in WebKit (28 page/viewport combinations). Checks included saved edits surviving reload, read-only ADMIN controls, protected pages, and navigation visibility.
- An upgrade from the six existing migrations preserved an existing PRO user and audit record, with STABLE rollout and initially null last activity.

The integration script is intentionally excluded from ordinary `npm test`: it creates fixtures and an audit-failure trigger in a disposable database. To rerun it, use a separate application copy and local test server sharing synthetic auth configuration, a localhost database named exactly `jarvis_admin_test`, and all migrations. Set `JARVIS_ADMIN_EMAILS=configured@example.test` in that test environment to include the legacy override checks. From that isolated copy, run:

```bash
ADMIN_TEST_ISOLATED=1 ADMIN_TEST_BASE_URL=http://127.0.0.1:3103 node scripts/test-admin-integration.mjs
```

The URL must match that copy's `NEXTAUTH_URL` and running test server. Do not point this script at a production server or database.
