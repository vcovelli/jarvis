# Onboarding implementation

The first-run `essentials` guide is deliberately limited to Theme, Must Win, Todos, Habits, Sleep, and Mood. The welcome defaults to the personal workspace, with demo as an optional secondary action. Completion offers a lightweight Finance introduction without navigating there or connecting accounts.

`userGuides.ts` describes reusable steps: stable ID, route, target selector, short explanation, optional anchored label/placement, and interaction event. `interactionTarget` can recognize interactions across a related control group. Step routes can select an existing UI section, such as `/v2/account?section=appearance`; guides do not simulate clicks to open hidden tabs or replace the real controls.

`WalkthroughProvider` owns progress, opt-outs, demo reset, navigation, and existing optional page reminders. `WalkthroughCoach` keeps explanations and navigation in their own row above the bottom navigation. `WalkthroughSpotlight` finds visible targets, measures scroll/resize/visual viewport changes, clips to the visible workspace, and positions a non-interactive pointer beside the actual control. Editors temporarily hide the pointer. On cramped screens the ring and bottom-panel instruction remain available. No spotlight layer captures input, forces an action, or moves keyboard focus.

Optional page guides remain separate from quick start. Future feature-specific guides can reuse this schema and rendering without adding steps to first run. No bank onboarding, provider setup, authentication, or secret-management flow is introduced here.

Before adding Assistant provider guidance, inspect the actual repository integration and distinguish server/operator configuration from user settings. Never invent supported providers, authentication methods, or client-side secret entry; server secrets must remain server-side.
