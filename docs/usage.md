# Jarvis Usage Guide

Jarvis is organized around a simple loop: choose the day’s Must Win, turn loose thoughts into a plan, record useful signals, and review what actually happened. Most actions save locally first and then sync to the signed-in user’s server workspace.

## Getting in

1. Open `/register` to create an account, unless registration is closed or requires the configured access code/invitation.
2. If verification is required, follow the email link. `/verify-email` can request another link without revealing whether an account exists.
3. Sign in at `/login` with the account email and password. Use **Forgot password?** for an enumeration-safe reset flow.
4. Start the short interactive welcome tour, or skip for now and resume from **User guide** later.

Every `/v2` workspace route requires an authenticated session. The public root page redirects an already signed-in user into the console.

## Navigation

Desktop navigation is grouped by purpose:

- **Start:** Home, Plan, Assistant
- **Daily rhythm:** Must Win, Habits, Mood, Journal, Sleep
- **Growth:** Objectives, Review
- **Resources:** Finances, Real Estate, Homelab, Docs
- **Account:** Settings, Account; authorized ADMIN/OWNER accounts also see Admin.

See [Jarvis Control](./admin.md) for user management, rollout levels, and system status.

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
- spending drill-downs by category, account, and merchant, including combined **Other** groups
- user classification rules for future matching
- finance questions through the assistant route

Choose a spending row to open its transaction explorer. Chart rows start with **Spending only**; **All transactions** includes other activity for that selection. Account rows open all account activity directly. Search, account/category filters, and sorting help narrow the list. Date ranges include **1Y** and **2Y**, and **Pending** controls whether pending activity is included. Totals show cents and cover every matching transaction in the selected range; **Show more transactions** reveals additional rows beyond the recent activity preview’s 24 entries.

Use **Back to finance** to return to the dashboard. The explorer URL retains the original selection, range, pending setting, and spending/all-activity choice when reloaded. Older transactions awaiting classification sync are visible in totals but require an account sync before corrections become available.

If Plaid is not configured, the page explains what is missing. Demo mode supplies generated accounts and transactions without exposing or changing real financial data. Removing a real connection deletes its synchronized Jarvis records and attempts to unlink the Plaid item; it does not close the underlying financial account.

Jarvis never initiates transfers, trades, or payments.

## Real Estate

The deal scanner ranks properties using editable price, location, unit, cash-needed, owner-cost, rent, and exit assumptions. You can filter the current board, enter a property manually, inspect a deal, and compare ranked opportunities.

The page uses built-in demo inventory by default. A live scan is authenticated and uses RentCast only when `RENTCAST_API_KEY` is configured and the server-side request budget allows it. Local filtering does not consume a live search request.

## Homelab and Docs

**Homelab** combines configured documentation snapshots, service metadata, monitoring summaries, and a bounded action log. Prometheus and Grafana links depend on the deployment environment.

**Docs** is a read-only browser for Markdown under `HOMELAB_DOCS_ROOT`. It indexes supported documentation categories, supports text search, renders the selected document, and can reveal its raw Markdown. This is a homelab knowledge browser, not the documentation for the Jarvis source repository.

## Themes and appearance

Choose **Show** on **Quick settings** in the sidebar or mobile More menu to choose appearance. **Hide** folds the controls away while keeping your look saved. Mode and palette are independent:

- **Mode:** Light, Dark, High Contrast
- **Palette:** Ocean, Forest & Wood, Rose, Violet

Any palette works with any foundation, including High Contrast. Changes apply immediately to the document, app chrome, cards, buttons, icons, form controls, and supported page workspaces, then persist in browser storage. Older saved theme names are migrated to the closest mode/palette pair.

See [UI and theming](./ui-and-theming.md) for implementation rules.

## Interactive user guide

Open **User guide** from the desktop sidebar, **More → User guide** on phone/tablet, Home, or Settings. The one-time welcome offers **Show me around**. Quick start previews mode and color in Quick settings, teaches **Hide/Show**, introduces a small daily routine, then opens Review to explain how the entries become useful summaries. It takes about three minutes. The library also has page guides and a full-app tour. Tips point at real controls; the explanation panel reserves its own screen space and stays inside the menu during mobile theme steps. Trying a control is optional and does not advance the guide.

**Next** saves your place immediately. **Close tour**, Escape, and completion keep the tour closed; there are no weekly reminders. Resume or replay explicitly from User guide. Progress belongs to the signed-in account in this browser, synchronizes between tabs, and stays separate from demo progress. If browser storage is blocked, the guide explains that progress lasts only for the visit.

For a fresh presentation, choose **User guide → Start a fresh demo walkthrough**. This resets sample daily data and demo guide progress while preserving personal records. Account settings and external service actions remain real.

See the [full user guide](./user-guide.md) for the written walkthrough.

## Demo mode

Settings can switch Jarvis into a privacy-safe showcase workspace. Demo mode replaces visible personal state across the dashboard, planner, habits, reviews, homelab, assistant context, and finance with generated data. Changes made while demonstrating remain in the isolated demo workspace and do not overwrite the personal workspace. Disable demo mode to return to real data.

Always verify the **Demo mode** or **Real data** status before sharing a screen.

## Saving and synchronization

Daily-life state is written to a user-specific browser cache first, then synchronized to `/api/state` for an authenticated user. The shell reports one of these states:

- **Opening workspace:** restoring this device before checking Jarvis
- **Saved on this device / Saving to Jarvis:** the local copy is safe while a remote write is queued or in progress
- **All caught up:** server and local snapshots agree
- **Working offline:** the device copy is safe and will sync after reconnection
- **Sync needs another try / Device save issue:** a remote or local operation needs attention

On mobile, pull down while the page is at the top to request the latest server state. The refresh surface expands inside the page and confirms when the workspace is current or when the phone could not reach Jarvis. The status notice above the bottom navigation explains active loading and synchronization; its **Retry** action appears after a remote sync error. Desktop users can also use the refresh control in the shell. Sync uses ETags to detect another device changing the same workspace. Deletion tombstones for moods, mood tags, and todos prevent removed items from being resurrected during merges.

Browser storage is a responsive cache, not a substitute for production database backups.

## Account and security

The Account page shows the signed-in identity, duplicates the appearance controls, downloads a portable redacted JSON export, supports password changes, and provides **Sign out everywhere**. Password change/reset and global sign-out invalidate existing sessions, so sign in again afterward.

Account deletion requires the current password. Jarvis attempts to unlink connected Plaid items, then deletes user-owned relational data through cascading ownership rules. Provider revocation is best effort, and deleted data is not user-recoverable without an operator-managed backup.

The Settings page controls demo mode. Sign out from the expanded Quick settings panel.

## Install as an app

Jarvis includes an installable web manifest and standalone display mode. The installed app starts at `/v2`.

- Android/Chrome: open the site menu and choose **Install app** or **Add to Home screen**.
- iPhone/iPad: open Jarvis in Safari, use **Share → Add to Home Screen**, and keep **Open as Web App** enabled when offered.

The layout accounts for safe-area insets and reserves space for the mobile bottom navigation. Each route resets the internal content viewport to the top when navigation completes.

The installed app checks for a changed Jarvis server runtime after launch, resume, reconnect, or back/forward restoration. If an update is available, it attempts to save first, displays **A fresh Jarvis is ready**, and reloads automatically. This lifecycle check improves release pickup but does not provide complete offline application support; Jarvis intentionally does not register a custom offline service worker yet.

## Troubleshooting

- **A change says “Working offline”:** keep the app open when practical and restore the connection. Jarvis retries and refreshes on reconnect; pull down from the top if you want to check immediately.
- **Voice recording does not start:** grant microphone permission. If browser recognition is unsupported, server transcription also requires `OPENAI_API_KEY`.
- **General assistant chat reports OpenClaw unavailable:** configure and start the gateway or continue using supported structured commands and local summaries.
- **Plaid controls say setup is needed:** configure the Plaid variables and restart the server.
- **Real Estate stays in demo mode:** configure `RENTCAST_API_KEY`, select live mode, and run a scan.
- **Homelab docs are empty:** point `HOMELAB_DOCS_ROOT` to a readable Markdown tree.
- **A containerized media service is shown inactive:** refresh `live/containers.md` and confirm its Docker name matches `HOMELAB_JELLYFIN_CONTAINER` or `HOMELAB_NAVIDROME_CONTAINER`.
