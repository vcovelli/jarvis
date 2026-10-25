# Compact responsive navigation — 17.11.0

The oversized Console heading, descriptive card and repeated link descriptions
have been removed. Desktop navigation uses a 224 px sidebar with compact icons,
single-line labels and a page filter. Collapse preserves a 64 px quick-access
rail instead of hiding the menu behind a floating button. The preference remains
saved across reloads. Operations, Assistant and Finances stay reachable from the
rail, and Show all pages expands the full list.

Below 1024 px, the five mobile shortcuts remain available in a simpler 64 px
bottom bar, plus device safe-area padding. More opens a searchable full menu.
The drawer has 44 px touch targets, a focus trap, Escape/backdrop dismissal,
focus restoration and automatic dismissal when switching to desktop width.
Theme, sync, account and guide controls remain available. Reduced-motion
preferences disable navigation animations. Page navigation only marks a mobile
tab pending on activation, not pointer-down, and pending feedback expires if a
navigation stalls. Modified clicks preserve normal new-tab behavior.

Filtering matches page names and descriptions, including GPU/power searches for
Operations. It does not change authorization: Operations/Admin links retain their
existing entitlement restrictions, and API/page checks are unchanged.

## Validation

`scripts/test-navigation.mjs` uses only the disposable `jarvis_power_test`
database on `/tmp/jarvis-power-test/socket`, with synthetic owner/member users.
It covers desktop and collapsed layouts, saved preferences, filtering, active
links, light/dark themes, keyboard focus, touch target sizes, drawer dismissal,
real page navigation, landscape and responsive transitions. Screenshot/test
widths include 320, 390, 768, 1024 and 1440 px.

Run from apps/web with the isolated .env and an installed Playwright module:

```bash
OPERATIONS_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
  node --env-file=.env scripts/test-navigation.mjs
```

The script exercises Chromium and WebKit; both browser engines and their host
libraries must be available. `NAV_WEBKIT_EXECUTABLE` can select a temporary
launcher when browser libraries are extracted outside the host installation.
It never alters production users or data. Both engine suites passed for this
release, including light/dark themes, reduced motion, owner/member access,
focus restoration, collapse persistence and the listed viewport sizes.

No database migration, dependency change or new privileged service is required.
Build separately, retain the prior source/build/environment, and restart the
existing Jarvis process. Rollback restores those artifacts without database changes.
