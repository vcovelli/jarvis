# Operations Center V1

Source implementation: branch `feat/operations-v1`, isolated checkout
`/home/vcovelli/projects/jarvis-operations`. This is a development implementation;
production migration, deployment, and scheduler activation are separate approval steps.

## Repository findings

Jarvis is Next.js 16 / React 19 / TypeScript with App Router, PostgreSQL and Prisma 5,
NextAuth JWT sessions, and database-backed ADMIN/OWNER entitlements. The existing
finance integration encrypts Plaid access tokens and maintains classified
`FinancialEvent` records. Personal tasks live in `UserState.state.todos`.
The assistant already has OpenClaw streaming and an OpenAI Responses integration.
Monitoring has a Prometheus client and generated homelab documentation. Existing
`JobLease` rows protect finance sync; a cron/timer entry invokes the internal finance
sync route. There is no existing durable domain-analysis queue or notification table.
Email delivery exists for account workflows; no configured SMS or PWA-push delivery
was established during inspection.

Read-only host verification on 2026-10-19 found hostname `covelli-server` and active
systemd units for PostgreSQL, Nginx, Pi-hole, Unbound, Tailscale, and SSH. The named
Prometheus and Grafana systemd units were inactive; that does **not** establish that
containerized instances are absent. Network addresses, gateway topology, GPU inference
runtime, backup integrity, and running production commit were not independently verified.
No production service or network setting was changed.

## Using Operations

ADMIN/OWNER users can open `/v2/operations` through Start in desktop navigation or
More on mobile. A regular invited user cannot access host operations. All operational
records and financial reads remain scoped to the authenticated user.

1. Initialize Operations. This creates a **paused**, disabled profile and six schedules.
2. Review Preferences: stable objectives, liquidity floor, risk and investment horizon,
   business priorities, monthly spending preference, reliability preferences, quiet
   hours/timezone, operating caps, and explicit energy assumptions.
3. After an approved worker deployment, enable the observation loop. The overview
   reports when the worker last checked in; merely enabling it does not install a worker.
4. Review decisions, supporting evidence, original assumptions, source freshness,
   uncertainty, expected benefit/downside, alternatives, and the exact proposed action.
5. Approve one read-only recheck, reject, request fresh deterministic analysis, or snooze
   24 hours. Approval requires a confirmation showing the action and expiry. It cannot
   authorize a financial transaction, message, remediation, deployment, or future category.
6. Record user-reported observed outcomes, variance, and process quality separately.
   Original briefs and preference snapshots remain unchanged. Recheck completion proves
   that an observation was persisted, **not** that the condition was fixed.

Emergency pause cancels queued/retrying/running work for this user's operations loop,
fences off stale worker commits, and aborts optional model requests on the next worker
check (500 ms). It does not stop the existing interactive Assistant or Plaid sync.
Already received provider requests may still be billed; reservations are retained.

## Durable loop and policy

`operations-worker.mjs` is a bounded, one-shot CLI, intended for the existing host
scheduler. It opens no listener and runs no shell commands. It visits at most 100
enabled profiles and processes at most eight jobs per profile per invocation.

| Agent/job | Default cadence | Sources and behavior |
| --- | --- | --- |
| Infrastructure | 30 minutes | Node OS APIs, `/proc/meminfo`, root `statfs`; optional configured Prometheus `up` and backup completion marker |
| Security | 30 minutes | User-scoped application audit failures, proc wildcard TCP listeners, fingerprint of `/etc/ssh/sshd_config` |
| Finance | Daily and after detected Plaid sync | Classified USD cash flow/spending, prior-period change, liquidity preference, spending ceiling, security concentration |
| Business | Daily | Saved incomplete/overdue personal tasks; business revenue/expenses remain unavailable |
| Executive | Daily | Latest four domain observations, freshness, warnings, saved priorities |
| Strategy | Weekly | Available domain evidence and priorities; optional bounded advisory reasoning |

Schedules persist their next due times and unique due-slot keys. Missed intervals are
coalesced after downtime. Successful Plaid sync timestamps become durable deduplicated
finance-analysis events; no Plaid requests or tokens are needed. Existing finance sync
and its leases are unchanged.

A PostgreSQL profile-row lock serializes scheduling, claiming, budget reservations,
approval changes, and completion for one user. Each run carries a random lease token,
45-second lease, maximum three attempts, exponential backoff, and a 20-second combined
collection/reasoning timeout. Database transactions have separate 10-second timeouts.
Only one collector per user can be active. Completion checks the current lease token,
lease expiry, current entitlement, approval validity, and pause state inside the same
transaction that persists observations, decisions, notifications, executions, and audit.
Leases recover after a crash. Expired approvals never execute. A unique approval-to-run
and approval-to-execution mapping prevents duplicate durable action results.

Collection and provider requests can repeat after a crash (read-only, at-least-once);
durable observations and approved action results commit once. There are no irreversible
external effects to roll back. Failed attempts keep their budget reservations.

The sole execution allowlist entry is `observe.recheck(domain, decisionId)`. SHA-256
binds its canonical parameters **and expiration**. The browser must submit that digest;
the server reloads the stored action and verifies it at approval, claim, and completion.
Preferences cannot modify this allowlist. Model output is never parsed as an action.

Notifications persist in the in-app inbox with severity, source, timestamp, optional
decision link, dedupe key, read state, and quiet-hour delivery time. No email, SMS, or
push message is sent. Snooze defers the related unread alert; approve/reject mark it read.
Repeated conditions are suppressed for seven days unless they disappear/recur or escalate.

## Persistence and boundaries

The additive migration `20261019060000_operations_v1` creates profiles, schedules, runs,
observations, decisions, approvals, verified executions, notifications, outcomes, and
per-attempt cost reservations. It reuses `User`, entitlements, and `AuditLog`. All tables
have a user foreign key and deletion behavior consistent with existing account deletion.
It does not rewrite existing data. Operational cross-record IDs are application-enforced;
only the server may write them.

The APIs use existing ADMIN/OWNER authorization, same-origin JSON writes, bounded bodies,
no-store responses, and the existing request rate limiter. Worker claims recheck stored
entitlements. The existing rate limiter is process-local; database locks, unique keys,
and budget checks remain the cross-process authority. Worker lease tokens and financial
credentials are excluded from browser responses. The operations collector never selects
Plaid encrypted tokens, raw transactions, SSH keys, or private logs. Audit metadata uses
record IDs for runs/actions; preference changes intentionally preserve preference history.

No generic tool dispatcher, command execution, filesystem browsing, second auth system,
or second production database is introduced. Filesystem reads are fixed OS paths plus
an operator-configured backup marker. Prometheus URLs are operator configuration, never
model or request input. Requests have timeouts, bounded response bodies, and no redirects.
Use a least-privileged worker account. Do not grant Docker socket, sudo, shell tools, or
access to credential directories. PostgreSQL roles should grant only the required Jarvis
tables; this change does not alter production database roles automatically.

## Economic controller and optional models

Deterministic processing is the default and incurs **no model API calls**. Every attempt
reserves its maximum assumed local compute cost before starting. Model requests reserve
an additional conservative upper estimate transactionally before HTTP dispatch. Per-job,
UTC daily, and UTC monthly ceilings apply to reservations, including failures and retries.
Per-attempt reservation timestamps prevent old/retried jobs from escaping a new period's
cap. Agents cannot edit budgets. Model usage beyond the reserved assumption pauses the
profile and emits a critical alert. Failed/cancelled model requests retain the upper API
estimate because provider billing may be unknown. Budget-blocked work requires a new
explicit request or a later scheduled slot; raising a cap does not replay old jobs.

Energy estimate = duration hours × assumed whole-host watts / 1000 × USD/kWh.
This is **not measured electricity or GPU energy**. Default assumptions are 100 W and
$0.15/kWh and are editable. Model tokens are recorded when reported; local inference
request duration is recorded for local providers. API cost is an estimate from reported
tokens and operator-provided prices, not an invoice. Rates must be reviewed before
activation. Reservations remain conservative even after actual usage is known. No
profitability claim is made; attributable revenue and total business expenses are unknown.

Optional reasoning supports the existing OpenAI API key and a loopback
Responses-compatible local inference server. Both are disabled unless explicitly
configured. Model selection can be overridden per domain. Only a new/changed signal or
a daily/weekly review can invoke a model. Payloads include bounded numeric/boolean
aggregates, fixed signal codes, and limitations. They exclude transaction descriptions,
account/customer names, task text, raw provider records, free-text preferences, hostnames,
and credentials. Requests have no tools, disable response storage, cap output tokens,
and require a strict `{summary, uncertainty}` object. The server validates the result;
refusals, tool calls, extra fields, malformed or incomplete output cannot grant authority.

The existing OpenClaw interactive Assistant is preserved. Autonomous OpenClaw execution
is deliberately rejected: the existing gateway client does not establish a tool-free,
bounded-cost agent session. Connecting it requires a separately reviewed gateway policy,
not reuse of the unrestricted interactive agent. No local runtime or weights are installed.
Live model compatibility and billing have not been tested; transport tests use mocks.
The request format follows the official [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Environment

Existing `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, entitlement configuration,
and optional `PROMETHEUS_BASE_URL` are reused. The CLI expects its environment supplied
by the existing scheduler; it does not silently read another checkout's `.env`.

| Variable | Meaning |
| --- | --- |
| `OPERATIONS_PROMETHEUS_URL` | Optional override of existing `PROMETHEUS_BASE_URL`; if neither is explicitly set, service telemetry remains unknown |
| `OPERATIONS_BACKUP_MARKER` | Optional absolute path to a completion marker that an existing successful backup process updates; >36 hours warns |
| `OPERATIONS_MODEL_PROVIDER` | `disabled` (default), `openai`, or `local` |
| `OPERATIONS_MODEL` | Explicit model ID; no hard-coded model selection |
| `OPERATIONS_<DOMAIN>_PROVIDER`, `OPERATIONS_<DOMAIN>_MODEL` | Optional per-domain overrides (`FINANCE`, `INFRASTRUCTURE`, `BUSINESS`, `SECURITY`, `EXECUTIVE`, `STRATEGY`) |
| `OPENAI_API_KEY` | Existing cloud key, read only by the server adapter |
| `OPERATIONS_MODEL_INPUT_USD_PER_MILLION` | Required explicit positive input-price assumption for cloud mode |
| `OPERATIONS_MODEL_OUTPUT_USD_PER_MILLION` | Required explicit positive output-price assumption for cloud mode |
| `OPERATIONS_LOCAL_RESPONSES_URL` | Explicit loopback URL ending `/v1/responses`; no credentials, redirects, or remote host accepted |

## Approval-gated production activation

Do not run these steps until the user approves production migration/deployment and
scheduler changes. Model activation/spending is a separate opt-in; keep provider disabled.

1. Review this branch and migration, select an immutable release, and verify a current
   production backup using the existing backup/restore procedure. Preserve ignored config.
2. Prepare a separate release checkout with production configuration supplied securely;
   run the existing dependency installation, Prisma generation, lint/tests, and build there.
   Do not build over the running application's `.next` output.
3. Apply `npm run prisma:migrate:deploy` from the approved release's `apps/web`. The new
   migration is additive; no reset, schema push, or destructive down migration is needed.
4. Switch/restart the existing Jarvis application using the approved deployment workflow.
   Verify `/api/health`, `/api/ready`, authenticated Operations access, and ordinary pages.
5. Add a single invocation of `npm run operations:worker` each minute to the **existing**
   scheduler with the approved release's `apps/web` working directory and protected env.
   Node 22.15+ is required for the CLI's existing-style type stripping. Do not create a
   public cron endpoint, run a second application listener, or change firewall rules.
6. Initialize/enable your profile through Operations. Confirm a worker check-in, real
   infrastructure observation, daily summary, and a decision for a real signal. Approve
   one read-only recheck and verify the persisted execution and audit event.
7. Monitor worker exit status and Activity failures; an absent worker appears stale after
   five minutes. Review retention before extended use; V1 has no automatic data deletion.

Rollback: pause Operations first, remove/disable its approved scheduler invocation, then
return the app to the prior compatible release using the existing process workflow.
Keep additive tables and audit history. Do not delete production data or attempt a
schema downgrade automatically. An old release does not use the new tables. Re-enabling
requires fresh review; cancelled approved actions are not silently replayed.

## Validation and known limits

The implementation is exercised against a disposable PostgreSQL 16 cluster under
`/tmp/jarvis-operations-test`, listening on a Unix socket only. All migrations apply
there. The production database is never loaded or connected during these tests.

From `apps/web`:

```bash
npm run lint
npm test
npm run build
npm run test:operations
# These refuse any database outside the explicitly named isolated Unix-socket database:
OPERATIONS_TEST_ISOLATED=1 npm run test:operations:integration
OPERATIONS_TEST_ISOLATED=1 OPERATIONS_TEST_BASE_URL=http://127.0.0.1:3317 npm run test:operations:http
```

Supply the isolated `DATABASE_URL` and test `NEXTAUTH_SECRET` explicitly. HTTP tests need
an isolated development server bound to `127.0.0.1:3317`. Browser checks additionally
accept `OPERATIONS_PLAYWRIGHT_PATH` pointing to an installed Playwright module; no new
browser package is a runtime dependency. Test users and synthetic data are removed.
Production startup correctly requires HTTPS; it was not weakened for local testing.

Coverage includes actual OS collection, scheduled persistence and restart visibility,
concurrent worker claims and approvals, expired/tampered approvals, cross-user rejection,
revoked entitlements, pause fencing, lease recovery, retry exhaustion, budget caps and
period rollover, finance-sync events, atomic audit rollback, optional model schema/tool
rejection and budget reservation, API authentication/CSRF/throttling, and mobile approval,
preferences, pause, and overflow checks. API/model tests send no external communications.

Known limits: business accounting, portfolio historical performance, vulnerability scans,
privileged security logs, measured GPU power, SMS/email/push alerts, and autonomous
OpenClaw are not connected. Backup markers do not prove restore integrity. Wildcard
listeners do not prove public exposure. Finance is USD-only, requires classified records,
and fails visibly beyond 10,000 records per analysis window. Personal task due dates use
UTC. The UI shows the latest 100 decisions, 40 runs, 30 notifications, and 50 audit events;
full records remain in PostgreSQL. Single-host deployment matches the existing process-local
request limiter. Any multi-host deployment needs a shared limiter and a reviewed global
spending policy. Approval is scoped per user, not across every admin account on the host.

### Recorded verification — 2026-10-19

- `npm run verify`: lint passed, all **85** unit/regression tests passed, optimized
  production build passed and included the Operations page and APIs.
- `npm run test:operations:integration`: all **16** PostgreSQL integration tests passed,
  including the actual CLI worker collecting live host data into disposable tables.
- HTTP/mobile suite: **28** assertions passed using Chromium at 390×844 and 1280×900,
  with an explicit returning-user fixture and America/New_York browser timezone.
- `npm run version:check`, independent TypeScript checking, and `git diff --check` passed.
- Test migration applied all eight migrations to a new disposable PostgreSQL cluster.
  Test users were removed and temporary application/database services were stopped.
- Optional cloud/local model transport was mocked. No paid request, financial action,
  external message, production migration, restart, network change, or deployment occurred.
- Build emitted the existing non-blocking `baseline-browser-mapping` freshness warning;
  dependencies were not upgraded as part of this feature.
