# UI and Theming Guide

Jarvis uses one shared visual contract across every route. Pages may have their own composition, but backgrounds, text, surfaces, controls, focus states, and interaction feedback must come from the active theme rather than a page-specific dark color.

## Theme model

Appearance is the combination of one foundation and one palette:

| Foundation | Purpose |
| --- | --- |
| Light | Bright surfaces and dark text for daytime use. |
| Dark | Low-glare surfaces for evening and focused work. |
| High Contrast | Maximum surface separation and stronger borders, while retaining the selected palette. |

| Palette | Character |
| --- | --- |
| Ocean | Cyan with a cool blue secondary. |
| Forest & Wood | Leafy green accents grounded by cedar tones. |
| Rose | Rosy red with warm light or wine-dark surfaces. |
| Violet | Purple with an electric highlight. |

Mode and palette are independent. Never special-case High Contrast to Ocean; `data-theme="contrast"` must continue to honor `data-palette`.

## Runtime behavior

`src/lib/theme.ts` is the public theme API. It:

- reads `jarvis-theme-mode` and `jarvis-theme-palette` from `localStorage`
- migrates the legacy `jarvis-theme` values to the nearest current pairing
- applies `data-theme` and `data-palette` to the document root and body
- updates the browser `theme-color` metadata from `--background`
- dispatches `jarvis-theme-change` so mounted controls update on the same tap
- listens for browser storage events so another tab can update the active appearance

Use `updateThemePreference()` for user changes and `onThemeChange()` for subscribers. Do not independently write theme storage keys from a page.

## Semantic styling contract

Global CSS defines the actual palette values and compatibility overrides. New UI should prefer semantic classes and CSS variables over literal slate, navy, white, cyan, red, or green values.

Core primitives include:

- `theme-shell` for the application background
- `theme-workspace` for a feature workspace
- `theme-surface` for raised panels
- `theme-card` for nested cards
- `theme-modal` for dialogs and drawers
- `theme-text`, `theme-muted`, and `theme-kicker` for hierarchy
- `theme-input` for inputs, textareas, and selects
- `theme-button-primary` and `theme-button-secondary` for actions
- `theme-chip` and `theme-pill` for toggles, tags, and status controls

Use semantic status tokens for success, danger, and warning states. A status color must remain readable in both light and dark foundations; do not assume `text-white` is visible on a light semantic background.

Legacy Tailwind color combinations still receive theme-aware compatibility rules in `globals.css`, but new components should not expand that compatibility layer unless a deliberate migration requires it.

## Surface and shading rules

The visual depth order is:

```text
theme-shell → theme-workspace/theme-surface → theme-card → interactive control
```

Keep the separation subtle:

- shells provide the page atmosphere
- surfaces use a border, restrained gradient or tint, and a soft shadow
- nested cards are quieter than their parent surface
- focused or hovered controls lift slightly through border, tint, or shadow—not large motion
- disabled controls keep their layout but lower emphasis and suppress interaction feedback

Avoid hardcoded navy workspaces. This rule is especially important in the Plan time-blocking canvas, Habits workspace, and Assistant shell, which must follow Light and High Contrast as fully as other pages.

## Interaction rules

Interactive cards and section links should provide the same feedback established by the Real Estate module:

- visible hover/focus border change
- slight surface tint or shadow lift
- consistent transition timing
- pressed feedback on touch when useful
- clear selected and pending states

Apply hover-only lift effects inside `@media (hover: hover) and (pointer: fine)` so touch devices do not retain a fake hover state. Every interaction must still expose a keyboard-visible focus state.

Buttons must use the shared hierarchy:

- Primary for the main commit action in a region.
- Secondary for alternate, reveal, refresh, or cancel actions.
- Semantic danger styling for destructive actions, with confirmation where data loss is involved.
- Chips/pills for compact choices and filters, using `aria-pressed` or equivalent state.

Icons should use `currentColor`; their SVG paths must not hardcode a stroke or fill that can disagree with the label or active theme.

## Responsive shell

`src/app/v2/layout.tsx` owns the authenticated shell, and `PageViewport` owns the internal scroll viewport and shared page padding.

- Desktop uses a sticky grouped sidebar and a scrollable page region.
- Mobile reserves safe-area space for the fixed five-item bottom navigation.
- The primary mobile destinations are Home, Plan, Assistant, Finances, and More.
- A route transition resets the internal page viewport to its top.
- Mobile navigation marks a destination pending on the initiating pointer event so its icon and label respond on the first touch.

Do not add fixed top padding independently to a page to solve shell spacing. Extend the shared viewport rules or use a page-local layout only when the design genuinely needs different internal composition.

The mobile Home quick remote should fill at least the available phone viewport above navigation and center its main controls vertically. Detailed dashboard content follows below and is revealed with a sticky Show/Hide details control.

## Content visibility

- Do not truncate user-authored tags or critical action labels with ellipses.
- Allow chips to wrap or scroll while retaining their full accessible name.
- Keep body text at readable contrast in Light mode; muted does not mean faint.
- Use the semantic success and danger colors instead of arbitrary emerald/red utilities where the text/background pairing matters.
- Give touch targets enough height and spacing for one-handed use.

## Review checklist

For any shared UI change, verify:

1. Light, Dark, and High Contrast foundations.
2. Ocean, Forest & Wood, Rose, and Violet palettes in each foundation.
3. Text, SVG, borders, shadows, inputs, buttons, disabled states, and destructive states.
4. Mouse hover, keyboard focus, touch press, selected state, and navigation pending state.
5. A narrow phone, a tall phone, tablet width, and desktop width.
6. No horizontal clipping, inaccessible sticky control, or content hidden behind the mobile navigation.
7. `npm run verify` before handoff.
