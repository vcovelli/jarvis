# Jarvis mobile UX audit and implementation

Date: 2026-09-07

This is a historical implementation audit. Verification counts describe that original pass; route sections for pages no longer shipped have been removed.

## Product strategy

Mobile Jarvis is the remote control: it leads with current state, attention, and the next useful action. Desktop remains the command center: it keeps broad comparisons, dense charts, full configuration, and parallel panels visible. Both compositions use the same routes, providers, state store, API handlers, authentication, finance classification, and domain calculations.

The shell switches at the existing `lg` breakpoint (1024px). Layout contracts target the requested 320, 375, 390, and 430px phone widths; 768px is the tablet target, and 1024/1440px are the desktop targets. The app already declares `viewport-fit=cover`, standalone PWA metadata, and support for both portrait and landscape orientation. This pass extends safe-area treatment to page scrolling, bottom navigation, sheets, and public authentication screens.

## Shared findings and implementation

- Navigation: the five-slot mobile bar keeps Home, Plan, Assistant, Finance, and More immediately available. More exposes the available modules. The drawer now locks background scroll, closes with Escape, traps and restores focus, and exposes dialog semantics.
- Focused views: `MobileSectionNav` provides a consistent, horizontally scrollable, sticky, 44px-tall section switcher. It changes presentation only; it does not duplicate state or business logic.
- Density: phone headers and cards use compact spacing. High-density pages select one focused view on mobile while desktop continues to render the full multi-panel workspace.
- Touch and overflow: mobile page controls have a 44px minimum height, with compact date cells sized to fit all seven columns. Page roots remain `min-width: 0`/`overflow-x: hidden`; horizontal control rails are intentionally scrollable and use touch panning.
- PWA: header, authentication, viewport, bottom navigation, sync notice, and sheet padding account for iOS safe-area insets. The mobile navigation occupies its own flex row below the scrolling viewport, so content never needs to scroll behind the bar.
- States: existing loading, empty, error, offline, sync, disconnected Plaid, unavailable monitoring, and demo states remain in the focused composition instead of being hidden.
- Accessibility: labels, `aria-current`, `aria-expanded`, dialog names, modal semantics, keyboard focus outlines, Escape handling, reduced motion, and keyboard-operable chart points are retained or improved.

## Responsive polish

- The primary bottom bar is 72px tall plus the device's bottom inset, reduced from 96px plus the inset. All five controls fit inside the bar. It is a nonshrinking row in the app shell; page padding no longer compensates for a fixed overlay.
- Long page content keeps its natural height inside the scroll viewport. Assistant, desktop Planner, and desktop Habits fill the available space and scroll their own content. Toasts and the planner add action clear the navigation.
- The desktop sidebar uses 240px below 1280px and 288px above it. Collapsing it reserves space for the expand control. The mobile drawer closes when resizing to desktop, and expanded shell controls scroll within short windows. Saved sidebar preferences render consistently during hydration.
- Assistant keeps its conversation rail in a drawer below 1280px and shows three parallel panels only from 1536px. Confirmation forms inherit the workspace height. Compact landscape headers and composers preserve conversation space.
- Journal and Documentation delay their two-column layouts until 1280px. Journal date cells fit narrow phones and announce full dates. Mood context fields and Finance account/investment grids can shrink to phone width.
- Planner date labels use compact spacing, and its timeline scroll area can shrink with the window. The Habits detail sidebar scrolls through its final entries.

## Mobile section-menu interaction follow-up

Finance, Real Estate, Homelab, Objectives, and Account share the same section menu. Touch taps now activate on finger release and cancel the subsequent synthetic mouse click, so one tap invokes the selection handler once. Movement beyond the tap tolerance, native scrolling cancellation, multiple fingers, and canceled touches do not activate the direct touch handler. Mouse clicks and keyboard Enter/Space retain native button behavior.

The rail no longer snaps horizontally or restricts gestures to horizontal panning. Vertical swipes can scroll the page, and pressed menu buttons stay in place. After a section change, the shared component measures the menu's normal position and returns the page to the beginning of the new section before paint. This corrects a reproduced Finance case where switching from a deeply scrolled panel left the new section at the old 890px scroll position instead of showing its start.

Touch validation used Chromium and WebKit with touch-enabled contexts at 320, 390, and 768px, a synthetic session, and demo Finance/Real Estate data. Across both engines, 168 taps each invoked selection exactly once and left the new section's start visible; 60 keyboard activations and 30 mouse clicks also passed. Ten additional Chromium cases covered horizontal/vertical swipes, canceled touches, multiple fingers, and release-only activation. No runtime errors were reported. Lint, all 28 existing tests, the production build, and whitespace checks passed.

Plain stationary taps worked in the baseline browser emulation; the original physical-device double-tap symptom was not reproduced there. The direct touch-release path removes reliance on emulated mouse/hover activation, but physical iOS/Android confirmation remains outstanding.

## Route-by-route audit

### `/v2` — Home

1. Purpose: daily command surface.
2. Important information: recommended next action, today’s mood/sleep/habits/Must Win/task/review state, and urgent system attention.
3. Likely mobile actions: ask Jarvis, speak a capture, complete the recommended action, or jump into a check-in.
4. Initial viewport: “What needs you next?”, recommended action, assistant/voice capture, and six concise remote tiles.
5. Drill-down: Mood, Sleep, Habits, Must Win, Planner, Review, Homelab, and detailed insights use their existing routes or the explicit details control.
6. Desktop emphasis: readiness metrics, weekly insight, operating mode, embedded forms, timeline, trends, and the end-of-day review.
7. Previous problem: the useful dashboard was still missing a direct voice/text capture row in its phone command surface.
8. Implemented: added Ask Jarvis and one-tap `?voice=1` capture while keeping detailed dashboard panels behind mobile progressive disclosure.

### `/v2/daily` and `/v2/todos` — Planner

1. Purpose: capture, schedule, prioritize, and complete tasks.
2. Important information: selected day, timeline, unscheduled items, Must Win, conflicts, and free windows.
3. Likely mobile actions: mind sweep, add/edit a task, change day, schedule, and complete.
4. Initial viewport: selected-day timeline or backlog-first capture based on the preserved `mode` query.
5. Drill-down: the task editor uses a full-height drawer; the calendar uses an overlay; Must Win is a focused card.
6. Desktop emphasis: time-blocking board, planner rail, drag/resize interactions, and parallel task context.
7. Existing risk: the planner is inherently dense and previously relied on a wide desktop board.
8. Implemented/verified: retained the distinct mobile list/timeline composition, 56px add action, safe-area drawer, no horizontal board overflow, and added labeled dialog semantics.

### `/v2/assistant` — Assistant

1. Purpose: conversational capture, planning, confirmation, memory, and domain assistance.
2. Important information: active conversation, response state, draft confirmation, voice state, and project context.
3. Likely mobile actions: type, speak, confirm/cancel, switch conversation, and start a new topic.
4. Initial viewport: active chat with composer and voice control inside a viewport-bounded workspace.
5. Drill-down: conversations open in a mobile sheet; confirmations and scheduling use focused panels.
6. Desktop emphasis: persistent project/conversation rail and parallel confirmation workspace.
7. Existing risk: multiple nested rails could produce double scrolling and unnamed sheet behavior.
8. Implemented/verified: preserved bounded internal scrolling and voice auto-start, and added dialog semantics to the conversation sheet.

### `/v2/must-win` — Must Win

1. Purpose: define and close one binary daily outcome.
2. Important information: current win, completion state, boundary, task pressure, and next moves.
3. Likely mobile actions: mark won/reopen, choose a task, or edit the win.
4. Initial viewport: the active win and completion action now appear before editing controls.
5. Drill-down: editing and task promotion remain directly below as focused cards.
6. Desktop emphasis: current state and editor remain visible in the original broad order.
7. Previous problem: mobile led with a large editor even when a win was already active.
8. Implemented: reordered current state ahead of configuration only on mobile and compacted header spacing.

### `/v2/habits` — Habits

1. Purpose: fast daily routine logging and chain maintenance.
2. Important information: selected day, habit statuses, streak/chain context, and period view.
3. Likely mobile actions: mark yes/no/skip, swipe periods, change week/month, and add/edit a habit.
4. Initial viewport: immersive day strip and habit grid with a dedicated safe-area footer.
5. Drill-down: habit editing uses a bottom sheet; chain detail stays in the same focused workspace.
6. Desktop emphasis: parallel chain summary, date context, and selected-day detail.
7. Existing risk: the immersive route replaces the global mobile bar and must own navigation/safe areas itself.
8. Implemented/verified: retained the route-specific footer, swipe guards, and bounded viewport; added labeled modal semantics to the editor.

### `/v2/mood` — Mood

1. Purpose: complete a low-friction mood check-in.
2. Important information: current score, tags, and today’s log.
3. Likely mobile actions: move the slider, select tags, log, add optional context, and edit an entry.
4. Initial viewport: large current score, slider, tags, and Log Mood action.
5. Drill-down: note/custom tag context uses native disclosure; trends are hidden below tablet width; history remains below the capture flow.
6. Desktop emphasis: seven-day signal and quick-state presets.
7. Existing risk: trends and presets could compete with a 60-second phone workflow.
8. Implemented/verified: kept capture-first composition and added the compact shared header behavior.

### `/v2/journal` — Journal

1. Purpose: rapid prompted or free-form reflection with dated history.
2. Important information: selected date, editor, entry count, and entries for that day.
3. Likely mobile actions: write/save, choose a prompt, edit/delete, then change date.
4. Initial viewport: Quick Journal title and editor now precede the monthly calendar.
5. Drill-down: the calendar follows capture; dated entry history remains below.
6. Desktop emphasis: month calendar and editor keep the original side-by-side order.
7. Previous problem: a full month grid delayed the primary writing action on phones.
8. Implemented: mobile-only ordering puts capture first and uses compact card padding without altering data or desktop behavior.

### `/v2/sleep` — Sleep

1. Purpose: log a sleep window, quality, recovery, dreams, and notes.
2. Important information: selected night, duration, quality/recovery, and schedule mode.
3. Likely mobile actions: adjust the clock, log/edit a night, or load a date.
4. Initial viewport: Recovery Log and the dedicated night editor.
5. Drill-down: recent nights and rest metrics remain behind View Details on mobile.
6. Desktop emphasis: full editor plus recent-night and trend panels.
7. Existing risk: the visual clock is tall, but it is the route’s primary direct-manipulation control.
8. Implemented/verified: retained the focused editor, mobile disclosure, date access, and added a clear page title/compact spacing.

### `/v2/objectives` — Objectives

1. Purpose: connect outcomes, projects, milestones, and next actions.
2. Important information: recommended action, tracked/at-risk counts, progress, and project completion.
3. Likely mobile actions: review the next action, open an objective, toggle a project, or add an objective.
4. Initial viewport: compact overview with the recommended action first.
5. Drill-down: Overview, Objectives, and New are focused mobile tabs; objective cards retain all status/project controls.
6. Desktop emphasis: overview, creation form, and full objective list remain simultaneously visible.
7. Previous problem: stats, creation form, and every objective formed one long feed.
8. Implemented: added focused tabs, compact metrics/cards, and returns to Objectives after creation.

### `/v2/review` — Review

1. Purpose: weekly system reset, trends, correlations, reflections, and experiments.
2. Important information: sleep/mood/completion signals and the manual reset form.
3. Likely mobile actions: complete the reset and optionally inspect insights.
4. Initial viewport: Weekly Reset and explicit View Insights control, followed by the reset workflow.
5. Drill-down: metrics, correlations, tag impact, killers, and highlights use a single progressive-disclosure region.
6. Desktop emphasis: all analytics remain expanded for comparison.
7. Existing risk: analytics could push the reflective action far below the fold.
8. Implemented/verified: retained mobile insights disclosure and added a clear compact title.

### `/v2/finance` — Finance

1. Purpose: understand current money state and move into the next financial task.
2. Important information: net worth, available cash, period spend, net flow, sync health, classification attention, and anomalies.
3. Likely mobile actions: sync/connect, review classification, inspect spending, check an account/activity, or review investments.
4. Initial viewport: Money at a Glance, sync/config state, four key metrics, review attention, up to two insights, and sync/connect action.
5. Drill-down: sticky Snapshot, Spending, Accounts, Activity, and Invest views reuse existing charts, rows, classification modal, Plaid controls, and holdings.
6. Desktop emphasis: command overview, all charts, classification queue, finance assistant, account stack, transactions, and holdings remain one expanded analytical workspace.
7. Previous problem: multiple panels defaulted open, making mobile a full financial report in one long feed.
8. Implemented: created a distinct snapshot and mutually focused mobile views without duplicating finance analytics, Plaid, classification, or API logic; bottom sheets now honor safe areas.

### `/v2/real-estate` — Real Estate

1. Purpose: scan, rank, and underwrite FHA property opportunities.
2. Important information: lead count, cash fit, median price, best cash flow, source/quota state, and selected-property score.
3. Likely mobile actions: scan leads, adjust filters, add a manual lead, analyze/save/reject a property, or open the map/listing.
4. Initial viewport: concise Deal Scanner summary and lead metrics.
5. Drill-down: Leads, Filters, Analysis, and Map are separate mobile views; Analyze moves directly into the selected property.
6. Desktop emphasis: map, ranked queue, filters, assumptions, and underwriting remain parallel.
7. Previous problem: filters, map, every lead, and a full underwriting rail formed one very long page.
8. Implemented: added focused views, hid secondary provider pills on narrow phones, compacted metrics, and preserved live/demo/manual logic.

### `/v2/homelab` — Homelab

1. Purpose: show server health, attention, live metrics, services, and guarded actions.
2. Important information: operational score, current attention, monitoring availability, inactive services, and snapshot freshness.
3. Likely mobile actions: refresh, open attention, inspect live metrics, check a service, or record a guarded review.
4. Initial viewport: server identity, refresh, operational score, and recommended action.
5. Drill-down: Overview, Live Metrics, and Services are focused mobile views; system identifiers appear from tablet width upward.
6. Desktop emphasis: identifiers, Prometheus charts, inventory metrics, service list, safe actions, and audit log remain expanded.
7. Previous problem: six identifiers, live charts, metrics, services, and audit actions produced a desktop console stack on mobile.
8. Implemented: added focused views and compact phone cards while retaining polling, stale/error states, Grafana/docs links, and audit-only safety boundaries.

### `/v2/documentation` — Documentation

1. Purpose: search and read indexed homelab documentation.
2. Important information: selected document title/path/freshness and search results.
3. Likely mobile actions: search, read, choose another document, or reveal raw Markdown.
4. Initial viewport: search and the selected document, not the complete category tree.
5. Drill-down: categories follow the document on mobile; raw Markdown remains native disclosure.
6. Desktop emphasis: sticky category sidebar beside the document.
7. Previous problem: the entire category index appeared before the selected content on narrow screens.
8. Implemented: responsive ordering puts content first on mobile and preserves the desktop two-column browser.

### `/v2/settings` — Settings

1. Purpose: manage privacy-safe demo mode and walkthrough controls.
2. Important information: real/demo state, sync mode, privacy guardrails, and generated workspace counts.
3. Likely mobile actions: enter/exit demo mode, start a pitch, replay walkthrough, or reset demo data.
4. Initial viewport: platform state and the complete privacy-mode action group.
5. Drill-down: guardrails and generated data counts remain below the actions.
6. Desktop emphasis: controls and workspace statistics sit side by side.
7. Existing problem: oversized card/header padding used space without improving action priority.
8. Implemented: compact mobile header/cards while retaining the short single-purpose flow.

### `/v2/account` — Account

1. Purpose: manage profile access, appearance, passwords, exports, sessions, and account lifecycle.
2. Important information: signed-in identity, selected appearance, and security/destructive actions.
3. Likely mobile actions: sign out/export, change appearance, change password, or intentionally enter account deletion.
4. Initial viewport: account identity and session actions.
5. Drill-down: Profile, Appearance, and Security are separate mobile tabs; deletion remains inside Security after password controls.
6. Desktop emphasis: all sections remain visible in the original order.
7. Previous problem: profile, theme matrices, password form, and destructive form were one long settings feed.
8. Implemented: added focused mobile tabs and compact cards without changing authentication or lifecycle endpoints.

## Public authentication routes

`/login`, `/register`, `/forgot-password`, `/reset-password`, and `/verify-email` were already narrow, single-column forms with labels and useful inline states. Their gap was installed-PWA viewport treatment. They now use `100dvh` and shared top/bottom safe-area padding; the verification card also uses smaller phone padding.

## Intentionally retained desktop-first detail

Desktop continues to be the preferred surface for Planner drag/resize scheduling, the Assistant’s persistent multi-rail workspace, cross-panel Finance analysis, full Real Estate map/filter/underwriting comparison, detailed Homelab monitoring, and broad weekly analytics. None is removed from mobile; it is reached through a focused tab, drawer, sheet, disclosure, or dedicated route.

## Verification notes

Validation used an isolated copy of the app with a synthetic session, generated demo data, fixture documentation, and intercepted API responses. The application authentication code and live database were not changed for browser testing. Cached Playwright/Chromium tooling was used without adding a project dependency.

- `npm run lint` and `npm test` passed: 28 tests.
- `npm run build -- --webpack` passed with TypeScript checking and 49 generated pages. Two existing finance route context declarations were corrected to use asynchronous params, as required by the installed Next.js version.
- `git diff --check` passed.
- Browser measurements covered 20 modules at 320×740, 390×844, 768×1024, 1024×768, 1440×900, and 844×390: 120 route/viewport combinations. Page widths and final scroll positions stayed within the viewport.
- All 36 focused-tab states were exercised at 320px and 768px. The two Finance overflow findings were corrected and all ten Finance tab/width combinations rechecked.
- Eighteen interaction states covered More navigation, Escape/focus restoration, mobile-to-desktop resizing, collapsed sidebar width, saved preferences, Assistant conversation drawers and confirmations through 1920px, task editing, and the final Habits sidebar entries. The final run reported no runtime or hydration errors.
- Nine safe-area cases used Chromium's inset override for portrait notches/home indicators, landscape side insets, and a short viewport. Navigation height, content boundaries, 44px navigation targets, composer position, and toast clearance passed.
- Representative screenshots were inspected. Physical iOS/Android device testing and live-provider integrations were outside this layout validation.
