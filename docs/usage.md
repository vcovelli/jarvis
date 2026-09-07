# Jarvis Usage Guide

Jarvis is organized around a simple loop: choose the day’s Must Win, turn loose thoughts into a plan, record useful signals, and review what actually happened. Most actions save locally first and then sync to the signed-in user’s server workspace.

## Getting in

1. Open `/register` to create an account, unless registration is closed or requires the configured access code/invitation.
2. If verification is required, follow the email link. `/verify-email` can request another link without revealing whether an account exists.
3. Sign in at `/login` with the account email and password. Use **Forgot password?** for an enumeration-safe reset flow.
4. Complete the first-run walkthrough when it appears.

Every `/v2` workspace route requires an authenticated session. The public root page redirects an already signed-in user into the console.

## Navigation

Desktop navigation is grouped by purpose:

- **Start:** Home, Plan, Assistant
- **Daily rhythm:** Must Win, Habits, Mood, Journal, Sleep
- **Growth:** Focus, Objectives, Review, Fitness, Career
- **Resources:** Finances, Real Estate, Homelab, Docs
- **Account:** Settings, Account

The desktop sidebar can be collapsed; use the floating **Nav** control to reopen it. Its bottom control shows save status and expands to reveal refresh, appearance, account, and sign-out controls.

On mobile, the fixed bottom bar keeps **Home**, **Plan**, **Assistant**, and **Finances** one tap away. **More** opens the complete grouped menu. The active icon and label update as soon as a destination is selected, including while the route is loading.

## A practical daily flow

### 1. Start on Home

The mobile Home view fills the available phone screen and centers the quick remote in a comfortable reach zone. It shows the recommended next action and shortcuts into the day’s key areas. Tap **Show details** to reveal the deeper dashboard; the sticky **Hide details** control remains accessible while the detail area is open.

The full dashboard combines today’s readiness, tasks, mood, sleep, Must Win, weekly pacing, and available infrastructure signals. Use its quick forms when you want to log without visiting a dedicated page.

### 2. Lock the Must Win

Open **Must Win** and enter the one outcome that would make the day count. The primary input is the first working area on the page. Use the save button or simply leave the form; Jarvis commits the draft locally first and shows whether server sync is complete or pending. An optional time boundary makes the commitment concrete; mark it complete when finished.

The same Must Win appears in the planner and contributes to review metrics.

### 3. Plan the work

Open **Plan** to work with a selected day.

- Use **Mind sweep** to capture an unscheduled thought quickly.
- Assign low, medium, or high priority.
- Schedule a draft immediately or leave it loose for later.
- Switch between **Task list** and **Schedule** on mobile.
- Add a start time, duration, color, icon, and repeat metadata when editing a task.
- Move lingering items forward, reorder tasks, complete them, or delete them.

The schedule is a planning view; Jarvis does not execute tasks or calendar changes outside the app.

### 4. Record the signals that matter

- **Mood:** Select a 1–10 value, choose visible tags, optionally add context, and log it.
- **Habits:** Create build or quit chains and record yes, no, or skip for each day.
- **Journal:** Add morning, priority, or free-form entries and edit existing writing.
- **Sleep:** Log duration, quality, recovery, timing, dreams, and notes; maintain daily, weekday/weekend, or custom sleep windows.

### 5. Review and adjust

The **Review** page summarizes sleep, mood, task completion, Must Win performance, correlations, tag impact, and reflection prompts. **Objectives** holds longer-term outcomes, next actions, milestones, and projects.

## Mood tags

Mood tags are standardized into two groups:

- Built-in tags remain consistent across users and cannot be renamed or removed.
- Custom tags belong to the workspace and can be added, renamed, or deleted.

On the Mood page, tap **Manage tags** to edit the custom library. Tag labels wrap or scroll within their controls instead of being shortened with an ellipsis, so the full text remains visible. Renaming a custom tag updates its use in existing mood entries. Deleting a custom tag removes it from the quick-tag library and existing mood entries after confirmation. Individual mood records have their own confirmed delete action.

Limits protect the synced state: up to 24 custom tags, with each tag limited to 24 characters.

## Assistant and voice

The Assistant supports saved conversations, project/domain organization, memories, typed requests, and voice capture.

For structured life-data actions, Jarvis recognizes commands such as:

- add, move, update, complete, or schedule a task
- log mood or sleep
- add a journal entry
- ask for a Jarvis, finance, or homelab status summary

Actions that change daily data are presented as drafts for confirmation. Speech uses the browser Speech Recognition API when available. Otherwise Jarvis can record a short clip and send it to the server transcription route when `OPENAI_API_KEY` is configured.

The command pipeline uses deterministic parsing first and can use the configured OpenAI intent model for fuzzy language. General conversation is handed to an optional OpenClaw gateway. If OpenClaw is unavailable, Jarvis reports that rather than pretending a response succeeded.

## Finances

Finances is a read-only financial dashboard. It supports:

- separate Plaid connection modes for bank/credit-card and investment accounts
- account balances, transactions, investment holdings, cash flow, and net-worth snapshots
- manual assets and liabilities with valuation history
- normalized financial events and a review queue
- user classification rules for future matching
- finance questions through the assistant route

If Plaid is not configured, the page explains what is missing. Demo mode supplies generated accounts and transactions without exposing or changing real financial data. Removing a real connection deletes its synchronized Jarvis records and attempts to unlink the Plaid item; it does not close the underlying financial account.

Jarvis never initiates transfers, trades, or payments.

## Real Estate

The deal scanner ranks properties using editable price, location, unit, cash-needed, owner-cost, rent, and exit assumptions. You can filter the current board, enter a property manually, inspect a deal, and compare ranked opportunities.

The page uses built-in demo inventory by default. A live scan is authenticated and uses RentCast only when `RENTCAST_API_KEY` is configured and the server-side request budget allows it. Local filtering does not consume a live search request.

## Homelab and Docs

**Homelab** combines configured documentation snapshots, service metadata, monitoring summaries, and a bounded action log. Prometheus and Grafana links depend on the deployment environment.

**Docs** is a read-only browser for Markdown under `HOMELAB_DOCS_ROOT`. It indexes supported documentation categories, supports text search, renders the selected document, and can reveal its raw Markdown. This is a homelab knowledge browser, not the documentation for the Jarvis source repository.

## Growth briefs

Focus, Fitness, and Career currently communicate the intended information architecture and recommended next step; they are not yet full persistence-backed trackers. Manufacturing is also a brief and intentionally does not appear in the primary navigation because it is deployment-specific.

## Themes and appearance

Expand the shell control in the sidebar or mobile More menu to choose appearance. Foundation and palette are independent:

- **Foundation:** Light, Dark, High Contrast
- **Palette:** Ocean, Forest & Wood, Rose, Violet

Any palette works with any foundation, including High Contrast. Changes apply immediately to the document, app chrome, cards, buttons, icons, form controls, and supported page workspaces, then persist in browser storage. Older saved theme names are migrated to the closest mode/palette pair.

See [UI and theming](./ui-and-theming.md) for implementation rules.

## Demo mode

Settings can switch Jarvis into a privacy-safe showcase workspace. Demo mode replaces visible personal state across the dashboard, planner, habits, reviews, homelab, assistant context, and finance with generated data. Changes made while demonstrating remain in the isolated demo workspace and do not overwrite the personal workspace. Disable demo mode to return to real data.

Always verify the **Demo mode** or **Real data** status before sharing a screen.

## Saving and synchronization

Daily-life state is written to a user-specific browser cache first, then synchronized to `/api/state` for an authenticated user. The shell reports one of these states:

- **Loading:** preparing the workspace
- **Saving soon / Saving:** a remote write is queued or in progress
- **Synced:** server and local snapshots agree
- **Saved locally:** the browser copy is safe but the server is offline or unavailable
- **Save issue:** a local or remote operation needs attention

Use the adjacent refresh control to request the latest server state. Sync uses ETags to detect another device changing the same workspace. Deletion tombstones for moods, mood tags, and todos prevent removed items from being resurrected during merges.

Browser storage is a responsive cache, not a substitute for production database backups.

## Account and security

The Account page shows the signed-in identity, duplicates the appearance controls, downloads a portable redacted JSON export, supports password changes, and provides **Sign out everywhere**. Password change/reset and global sign-out invalidate existing sessions, so sign in again afterward.

Account deletion requires the current password. Jarvis attempts to unlink connected Plaid items, then deletes user-owned relational data through cascading ownership rules. Provider revocation is best effort, and deleted data is not user-recoverable without an operator-managed backup.

The Settings page controls demo mode. Sign out from the expanded shell controls.

## Install as an app

Jarvis includes an installable web manifest and standalone display mode. The installed app starts at `/v2`.

- Android/Chrome: open the site menu and choose **Install app** or **Add to Home screen**.
- iPhone/iPad: open Jarvis in Safari, use **Share → Add to Home Screen**, and keep **Open as Web App** enabled when offered.

The layout accounts for safe-area insets and reserves space for the mobile bottom navigation. Each route resets the internal content viewport to the top when navigation completes.

## Troubleshooting

- **A change says “Saved locally”:** keep the tab open, restore the connection, then use refresh. Pending writes retry when connectivity returns.
- **Voice recording does not start:** grant microphone permission. If browser recognition is unsupported, server transcription also requires `OPENAI_API_KEY`.
- **General assistant chat reports OpenClaw unavailable:** configure and start the gateway or continue using supported structured commands and local summaries.
- **Plaid controls say setup is needed:** configure the Plaid variables and restart the server.
- **Real Estate stays in demo mode:** configure `RENTCAST_API_KEY`, select live mode, and run a scan.
- **Homelab docs are empty:** point `HOMELAB_DOCS_ROOT` to a readable Markdown tree.
