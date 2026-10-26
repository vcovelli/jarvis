# Tablet layouts and agent supervision

Home and Plan now accommodate short desktop windows as well as tablet widths.
At 1184 × 576, the planner leaves 455 px for the schedule in Chromium. Home uses
compact readiness metrics beside system awareness. Plan keeps date navigation,
calendar, Today, Week, and New block together; Week expands the day picker.
The side rail summarizes the selected day without a second set of large metrics.
Touch controls remain at least 44 px in the desktop planner toolbar.

## Agent workflow

- Home shows background worker state, queued/active jobs, approvals, and today's
  reserved budget against its cap. Agents & inbox opens the agent roster.
- Each domain shows its purpose, authority, reasoning configuration, next check,
  active jobs, last job status, usage, and recorded error. All active jobs are
  fetched separately from the latest 40 completed/recent records.
- Approvals opens the existing review workflow filtered to that agent. Queue
  check uses the existing guarded endpoint. Emergency pause remains available.
- New discussion creates an ordinary persisted Assistant conversation under an
  `agent-<domain>` topic. Opening it does not send a message or start a job.
  Links reopen the exact conversation, including after a reload. Archived chats
  and other users' chats are excluded from the roster.
- Agent discussions have their own project/topic grouping and project memory
  scope. Their banner identifies the associated agent and links to supervision.

## Boundaries

These agents perform observations, recommendations, and explicitly approved
read-only rechecks. This change does not enable consequential execution, change
provider configuration, start a production worker, or grant permissions.
Personal planner tasks are not worker assignments. Standing by requires an
enabled profile, fresh snapshot, and recent worker heartbeat; it does not mean
continuous inference or a guaranteed response time.

Chat uses the existing interactive gateway policy and separate billing. Agent
job records are displayed in the control room, not automatically sent as chat
context. Dedicated discussions associate conversations with an agent domain;
they do not attach authorization or transfer worker state to the model.
Revenue attribution remains unmeasured unless an existing run records a value.

## Verification

- Lint, TypeScript, and 97 unit tests passed.
- 17 operations integration tests passed against a disposable PostgreSQL
  instance, including ownership filtering and visibility of old queued jobs.
- The existing mocked reasoning integration test now sets its per-agent provider
  override explicitly, so server configuration cannot defeat the fixture.
- An isolated production build passed with webpack. Turbopack rejects the test
  copy's dependency symlink outside its root; production output was untouched.
- Chromium checked Home and Plan at 1184 × 576, 1024 × 768, 768 × 1024, and
  390 × 844; agent pages also fit 320 px. Week navigation, exact chat links,
  reload, no implicit message dispatch, and pause cancellation passed without
  browser exceptions or horizontal document overflow.

`apps/web/scripts/test-tablet-supervision.mjs` reproduces browser checks against
an isolated development server at `127.0.0.1:3326`. It requires `DATABASE_URL`
for `jarvis_operations_test` on `/tmp/jarvis-operations-test/socket`, a matching
test `NEXTAUTH_SECRET`, and `OPERATIONS_PLAYWRIGHT_PATH`. It creates and removes
only its synthetic account, blocks Assistant message requests, and saves
screenshots under `/tmp/jarvis-tablet-check/screenshots`.

No production deployment or database migration is included.
