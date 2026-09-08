# Deployment Readiness

Status date: 2026-09-07

## Current recommendation

Jarvis now has the application-level security and operations foundation required for a controlled personal, homelab, or invitation-only deployment. Keep registration closed or invitation/access-code gated until the production mail relay, proxy behavior, backups, scheduler, Plaid webhook, monitoring, and browser smoke tests have been verified in the target environment.

It is not yet a turnkey public SaaS or commercial self-host package. Billing is intentionally absent, entitlement records are a non-locking foundation, and policy/support/release packaging still require product decisions.

## Implemented in this readiness pass

- Per-IP and authenticated per-user rate limits on high-risk/auth/provider routes, with 429 and `Retry-After`; a replaceable in-memory store supports the current single-process deployment.
- Enumeration-safe password-reset requests and hashed, expiring, single-use reset tokens.
- Email verification and resend with hashed, expiring, single-use tokens; enforcement defaults off for existing installations.
- Seven-day secure production sessions and server-checked session-version invalidation after password change/reset or **Sign out everywhere**.
- Global CSP and browser security headers designed to preserve Plaid Link, PWA assets, microphone audio, and blob workers.
- Sanitized relational `AuditLog` events for authentication, account, finance, sync, and webhook actions.
- Lightweight `/api/health` liveness and database/config-aware `/api/ready` readiness endpoints.
- Safe backup and disposable restore-check scripts plus an operator runbook.
- Plaid webhook signature/body verification, idempotent event storage, user-owned connection matching, and failure-isolated sync handling.
- Authenticated scheduled all-connection finance sync with database leases preventing global and per-connection overlap.
- Authenticated portable JSON export with credential, raw provider, password, token, and secret fields removed; minimal Account UI exposes export.
- Password-confirmed account deletion with best-effort Plaid item removal before relational cascade deletion.
- Backward-compatible `Entitlement` records and server helpers for `FREE`, `INVITED`, `PRO`, and `ADMIN`; no payment provider and no default feature lockout.
- Registration modes for open, shared access code, database-backed one-time invite, or disabled access, with legacy variables preserved.
- Startup/config validation that reports missing variable names without printing values.
- Structured provider/job/account failure logs that avoid raw provider payloads and secrets.
- Focused tests for registration, rate limiting, token expiry/reuse/type, ownership helpers, export redaction, entitlement policy, and readiness configuration.
- A dry-run-capable deployment helper, backup/restore procedures, rollback steps, and pre/post-deploy checklists.
- Mobile-first workspace lifecycle feedback, embedded pull-to-refresh, resume/reconnect synchronization, session refresh, and installed-PWA runtime update detection without caching authenticated HTML or APIs.

The additive migration is `20260906190000_deployment_security_foundation`. It adds `sessionVersion`, auth tokens, audit logs, entitlements, registration invites, webhook events, and job leases. Existing users are backfilled with active `INVITED` entitlement and email-verification enforcement remains disabled unless explicitly enabled.

## Verification evidence

Repository verification for this pass:

- `npx prisma validate` — passed.
- `npx prisma generate` — passed with Prisma 5.22.0.
- `npm test` — 24/24 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed with Next.js 16.0.10.
- Shell helpers passed `bash -n`.

Production authentication repair completed on 2026-09-07:

- Created and catalog-verified the pre-migration backup `/var/backups/jarvis/jarvis-20260907T182320Z.dump`.
- Applied `20260906190000_deployment_security_foundation`; `npx prisma migrate status` then reported the database schema up to date.
- Corrected the credentials-route wrapper to preserve the NextAuth App Router context and added a resilient client-side sign-in error fallback.
- Restarted only the existing `jarvis` PM2 process. The deployment helper was not executed and production configuration was not changed.
- `/api/health`, `/api/ready`, and `/api/auth/providers` returned 200 after restart. A CSRF-protected synthetic invalid credentials request returned structured JSON with 401, confirming the callback no longer returned a blank 500.

## Required environment-specific work

Remaining environment-specific work before broader controlled production use:

1. Rehearse the verified backup restore into a `jarvis_restore_check_*` database and configure encrypted off-host retention.
2. Configure stable secrets, HTTPS, proxy header trust, and closed/invited registration.
3. Configure/test the email relay before setting `EMAIL_VERIFICATION_REQUIRED=true`.
4. Confirm `npx prisma migrate status` remains current during every subsequent release.
5. Configure the Plaid webhook URL and verify signed sandbox/development delivery.
6. Store `INTERNAL_JOB_SECRET` securely and install a single scheduler invocation.
7. Verify audit/log collection and alerts for readiness, auth abuse, provider failures, and backups.
8. Complete the post-deploy browser checklist in [deployment.md](./deployment.md).

## Known limitations and remaining gaps

- The rate-limit store is local to one Node process. Multi-process/multi-instance use needs a shared Redis/database/edge implementation.
- Scheduled sync is exposed as a protected job endpoint and helper, but the repository does not install cron/systemd/platform scheduling.
- Email delivery is a provider-neutral HTTP relay, not a bundled mail vendor; bounce, suppression, and delivery dashboards live with the operator/provider.
- Entitlements do not represent billing and are not enforced as paid feature gates. Do not accept subscriptions on this basis.
- There is no admin UI for invitations, account suspension, entitlement changes, audit browsing, or support operations.
- Export is one-way JSON; no import/restore-to-account workflow or formal retention policy exists.
- Audit rows are mutable database records, not an append-only compliance system; retention/archival policy remains operational work.
- Account deletion makes best-effort provider revocation. A provider outage can leave an item requiring follow-up even though local records are removed.
- RentCast quota/cache state remains single-host filesystem state.
- Automated coverage tests important pure boundaries, but database-backed route integration, browser E2E, accessibility, and provider contract tests remain to be built.
- Legal privacy/terms, incident response ownership, support policy, licensing, release artifacts, and a supported container/package are outside this code pass.

## Release gate

A controlled release is approved only when all are true:

- `npm run config:validate -- --production`, `npx prisma validate`, and `npm run verify` pass with target configuration.
- A fresh backup exists and a recent disposable restore drill passed.
- Registration policy, email behavior, proxy trust, and session invalidation were tested.
- Migration status is understood and the additive migration is applied exactly once.
- Health/readiness monitoring and log/audit collection are active.
- Plaid webhook and scheduled sync are either configured/tested or intentionally disabled.
- Account export, deletion, and provider unlink were tested with a disposable user.
- Desktop/mobile/theme and core create-delete-sync smoke checks pass.
- A schema-compatible rollback release and named operator are available.

## Commercial readiness

Before open paid signup, add verified checkout/customer portal and signed billing webhooks, reconcile billing into entitlements, define trial/cancellation/grace/read-only behavior, enforce entitlements server-side, add admin/support tooling, publish privacy/terms/retention policies, and expand browser/integration/security testing. No current route should be marketed as payment-gated.
