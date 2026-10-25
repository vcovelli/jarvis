import type { KeyboardEvent } from "react";

// Native dialogs make the page inert; wrap Tab inside the dialog as well so
// keyboard navigation does not escape to browser chrome at either end.
export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
  )].filter(node => node.getClientRects().length > 0 && !node.closest("[inert]"));
  const first = nodes[0], last = nodes.at(-1);
  if (!first || !last) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
