# Agent workspace — 17.12.0

Operations and Assistant share an authenticated agent workspace. This release
organizes existing observation, recommendation, approval, budget, and notification
behavior; it does not expand the execution allowlist or enable model spending.

## Operations

The view selector opens System, Briefing, Approvals, Agents, History, or Settings.
System has focused views for power/battery, CPU/memory/GPU, and services/backups,
plus a compact overview and an all-readings option. Readings retain their freshness,
failure, and measured-versus-estimated labels. The overview keeps GPU utilization,
VRAM, and board power visible, with process details in an expandable section.

Briefing presents human-readable signals and executive summaries. Decision details
display optional model advice and uncertainty separately from the exact proposed
action. Approvals can be searched and filtered by agent and status. Expired items
are excluded from Needs review. The existing action digest, expiry checks, per-user
locking, audit history, and one-approval/one-run constraints remain authoritative.
Only `observe.recheck` is executable; infrastructure changes, transactions, external
messages, and deployments have no executor connected to this inbox.

## Shared inbox and controls

The administrator-only layout provider shares one snapshot request between the page,
sidebar, and Assistant. It polls every 15 seconds while visible, refreshes on
reconnection, bounds requests to 10 seconds, clears protected data on 401/403, and
disables stale approvals/settings writes. Emergency pause remains available when a
previously received profile was active. A successful write forces a new snapshot
even when an older read was already in progress.

Delivered unread notifications prompt the user across Jarvis. Dismissing the prompt
does not mark its alerts read. Alerts remain in the durable inbox. Existing server
quiet-hour scheduling and snoozes apply. The inbox includes the latest 30 delivered
alerts; Approvals includes the latest 100 decisions. Pending totals may exceed the
displayed window. This is in-app delivery while Jarvis is open, **not** phone push,
email, or SMS. No external notification is sent by this release.

Workflow settings group quiet hours/timezone, operating caps/energy assumptions,
goals, temporary priorities, and action permissions. Unsaved fields survive polling
and worker heartbeats. Model credentials and provider configuration stay server-side.
Workflow doctor shows pause state, heartbeat, permission scope, delivery channels,
budgets, and sanitized per-domain reasoning configuration. Configured does not mean
that live provider connectivity has been tested. Fixed schedule cadences are shown.

## Assistant

Chat is the primary surface. Projects and history open on demand, with topics/recent
conversations collapsed on the start screen. Sending a message immediately starts
the conversation in the current topic. Chat settings include a device-local Enter
behavior preference, memory management, help, and links into workflow settings and
doctor. Enter ignores IME composition, Shift+Enter adds a line, and Send is disabled
while a response is in progress. Voice and the existing action-confirmation forms
remain available. Agent controls use the same durable inbox and settings as Operations.

Interactive Assistant gateway permissions and usage are separate from the observation
loop's approval gate and budget. The UI states this distinction and does not claim
to intercept arbitrary interactive gateway actions. No provider/model/worker activation,
sudo permission, Docker access, or production schema change is part of this release.

Native modal drawers make the background inert, wrap keyboard focus, close on Escape,
and restore focus to the opener. Mobile layouts keep 44px controls, safe areas, and
reduced-motion support.

## Verification

Use the disposable Unix-socket PostgreSQL cluster `jarvis_power_test` and local preview
on 127.0.0.1:3318. Browser scripts reject other database URLs. No test loads production
data or dispatches a live model request.

- `scripts/test-agent-workspace.mjs`: Chromium and WebKit, real isolated API/DB writes,
  auth isolation, tampered approval rejection, single persisted approval, deny,
  quiet delivery, unsaved settings, settings persistence, doctor, chat composer,
  320/390/768/1440px layouts, landscape, modal focus, Escape, member access.
- `scripts/test-system-panel.mjs`: live UPS/GPU read-only collection, responsive views,
  simulated outage, stale/unavailable data, and revoked access.
- `scripts/test-navigation.mjs`: sidebar/rail, themes, search, touch targets, responsive
  navigation, keyboard/focus, and route transitions in Chromium and WebKit.
- Standard lint, 94 unit/regression tests, optimized production build, and version check.

Browser engine testing is not a physical iPhone or Safari-device acceptance test.
