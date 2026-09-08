"use client";

import { useEffect, useRef } from "react";
import type { UserGuide } from "@/lib/userGuides";
import { useWalkthrough } from "./WalkthroughProvider";

export function WalkthroughDialog({ mode, finishedGuide, onClose }: {
  mode: "welcome" | "complete"; finishedGuide: UserGuide | null; onClose: () => void;
}) {
  const { start, startDemo, browse, skip, progress, setNeverPrompt, demoMode } = useWalkthrough();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const wasInert = shell?.inert ?? false;
    const wasLocked = document.body.classList.contains("scroll-locked");
    if (shell) shell.inert = true;
    document.body.classList.add("scroll-locked");
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      if (shell) shell.inert = wasInert;
      if (!wasLocked) document.body.classList.remove("scroll-locked");
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const welcome = mode === "welcome";
  const quickStart = finishedGuide?.id === "essentials";
  return (
    <div className="walkthrough-modal-layer theme-shell" data-no-pull-refresh="true">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-description" className="walkthrough-dialog theme-modal">
        <div className="flex items-center justify-between gap-3">
          <p className="theme-kicker text-xs font-semibold">{welcome ? "Welcome to Jarvis" : "Guide complete"}</p>
          <button type="button" className="theme-button-secondary rounded-full px-3 py-2 text-sm" onClick={onClose} aria-label={welcome ? "Skip walkthrough for now" : "Close guide summary"}>✕</button>
        </div>
        <h2 id="walkthrough-title" className="theme-text mt-3 text-2xl font-semibold leading-tight">
          {welcome ? "Make Jarvis yours." : quickStart ? "You’re ready for your day." : finishedGuide?.title ?? "Walkthrough complete"}
        </h2>
        <p id="walkthrough-description" className="theme-muted mt-3 text-sm leading-6">
          {welcome
            ? "Pick a look you love, then meet your daily tools. Six quick steps, with real controls. Try each one or move on whenever you’re ready."
            : quickStart ? "Choose one win, handle your todos, build your habits, and check in with sleep and mood. That’s your daily loop." : "Your progress is saved. Come back for another guide whenever you need it."}
        </p>
        <div className="theme-card mt-4 rounded-2xl p-4">
          <p className="theme-text text-sm font-semibold">{welcome ? "Six stops · about 3 minutes" : quickStart ? "Discover Finance later" : "Learn at your own pace"}</p>
          <p className="theme-muted mt-2 text-sm leading-6">{welcome ? "Theme → Must Win → Todos → Habits → Sleep → Mood" : quickStart ? "Finance becomes your financial command center once you connect your accounts. Set it up whenever you’re ready." : "Short guides are available in User guide whenever you choose to explore another feature."}</p>
        </div>
        <div className="mt-5 grid gap-2">
          {welcome ? (
            <>
              <button type="button" onClick={() => start("essentials")} className="theme-button-primary rounded-xl px-4 py-3 text-sm font-semibold">Personalize Jarvis</button>
              <button type="button" onClick={() => startDemo()} className="theme-button-secondary rounded-xl px-4 py-3 text-sm font-semibold">Try with demo data</button>
              <p className="theme-muted text-xs leading-5">Demo uses sample daily records and finance data. Account settings still apply to your real account.</p>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="theme-button-primary rounded-xl px-4 py-3 text-sm font-semibold">Use the app</button>
              {demoMode && <p className="theme-muted text-xs">You are still in demo mode. Return to real data in Settings when ready.</p>}
            </>
          )}
          <button type="button" onClick={browse} className="theme-button-secondary rounded-xl px-4 py-3 text-sm font-semibold">Browse the user guide</button>
        </div>
        <label className="theme-muted mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={progress.neverPrompt} onChange={(event) => setNeverPrompt(event.target.checked)} className="h-4 w-4 shrink-0" />
          Don’t show walkthrough suggestions again
        </label>
        {welcome && <button type="button" onClick={() => skip(progress.neverPrompt)} className="theme-button-secondary mt-1 w-full rounded-xl px-4 py-3 text-sm">Skip for now</button>}
        {welcome && <p className="theme-muted mt-2 text-xs leading-5">Skipped guides stay in your user guide. We may offer a quiet reminder after a week unless you turn suggestions off.</p>}
      </section>
    </div>
  );
}
