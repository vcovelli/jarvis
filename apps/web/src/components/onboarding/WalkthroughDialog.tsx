"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { UserGuide } from "@/lib/userGuides";
import { useWalkthrough } from "./WalkthroughProvider";

export function WalkthroughDialog({ mode, finishedGuide, onClose }: {
  mode: "welcome" | "complete"; finishedGuide: UserGuide | null; onClose: () => void;
}) {
  const { start, startDemo, browse, skip, demoMode, storageAvailable } = useWalkthrough();
  const router = useRouter();
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
          <button type="button" className="theme-button-secondary rounded-full px-3 py-2 text-sm" onClick={onClose} aria-label={welcome ? "Close walkthrough" : "Close guide summary"}>✕</button>
        </div>
        <h2 id="walkthrough-title" className="theme-text mt-3 text-2xl font-semibold leading-tight">
          {welcome ? "Make Jarvis yours." : quickStart ? "You’re ready for your day." : finishedGuide?.title ?? "Walkthrough complete"}
        </h2>
        <p id="walkthrough-description" className="theme-muted mt-3 text-sm leading-6">
          {welcome
            ? "Try a look you love, tuck the theme controls away, then learn a small daily routine. We’ll point to each control as you go. Try it or choose Next; there’s no need to fill everything in."
            : quickStart ? "Start with one win and one check-in today. As your entries build up, Review brings your sleep, mood, and progress together so you can decide what to adjust." : "Your progress is saved. Come back for another guide whenever you need it."}
        </p>
        <div className="theme-card mt-4 rounded-2xl p-4">
          <p className="theme-text text-sm font-semibold">{welcome ? "A few quick tips · about 3 minutes" : quickStart ? "Let the rest wait" : "Learn at your own pace"}</p>
          <p className="theme-muted mt-2 text-sm leading-6">{welcome ? "Make it yours → Clear some space → Track your day → See your progress" : quickStart ? "Finance, projects, and the other tools are there when you need them. User guide has a short walkthrough for each one." : "Short guides are available in User guide whenever you choose to explore another feature."}</p>
        </div>
        <div className="mt-5 grid gap-2">
          {welcome ? (
            <>
              <button type="button" onClick={() => start("essentials")} className="theme-button-primary rounded-xl px-4 py-3 text-sm font-semibold">Show me around</button>
              <button type="button" onClick={() => startDemo()} className="theme-button-secondary rounded-xl px-4 py-3 text-sm font-semibold">Try with demo data</button>
              <p className="theme-muted text-xs leading-5">Demo uses sample daily records and finance data. Account settings still apply to your real account.</p>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { onClose(); if (quickStart) router.push("/v2/must-win"); }} className="theme-button-primary rounded-xl px-4 py-3 text-sm font-semibold">{quickStart ? "Choose today’s win" : "Use the app"}</button>
              {demoMode && <p className="theme-muted text-xs">You are still in demo mode. Return to real data in Settings when ready.</p>}
            </>
          )}
          <button type="button" onClick={browse} className="theme-button-secondary rounded-xl px-4 py-3 text-sm font-semibold">Browse the user guide</button>
        </div>
        {welcome && <button type="button" onClick={skip} className="theme-button-secondary mt-3 w-full rounded-xl px-4 py-3 text-sm">Explore on my own</button>}
        <p className="theme-muted mt-3 text-xs leading-5">{storageAvailable ? "This welcome appears once. Next saves your place, and closing the tour keeps it closed. Resume or replay whenever you choose from User guide." : "Browser storage is unavailable. Your guide progress will last for this visit."}</p>
      </section>
    </div>
  );
}
