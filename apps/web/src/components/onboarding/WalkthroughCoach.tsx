"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { findGuide, matchesGuideRoute, type GuideStep } from "@/lib/userGuides";
import { useWalkthrough } from "./WalkthroughProvider";

export function WalkthroughCoach() {
  const { active } = useWalkthrough();
  const pathname = usePathname();
  return <CoachContent key={(active ? active.id + ":" + active.step : "notice") + pathname} />;
}

function CoachContent() {
  const { ready, navigationPending, active, notice, start, advance, finish, skip, dismissNotice, progress, browse, setGuideNeverSuggest } = useWalkthrough();
  const pathname = usePathname();
  const router = useRouter();
  const dockRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const permanent = Boolean(active && progress.guides[active.id]?.neverSuggest);
  const [practiced, setPracticed] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const guide = active ? findGuide(active.id) : undefined;
  const step = guide && active ? guide.steps[active.step] : undefined;
  const onRoute = Boolean(step && matchesGuideRoute(pathname, step.route));
  const hasContent = ready && Boolean(active || notice);


  useEffect(() => {
    if (!hasContent || !dockRef.current) return;
    const dock = dockRef.current;
    const measure = () => document.documentElement.style.setProperty("--walkthrough-coach-height", dock.getBoundingClientRect().height + "px");
    document.body.dataset.walkthroughActive = "true";
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    measure();
    return () => {
      observer.disconnect();
      delete document.body.dataset.walkthroughActive;
      document.documentElement.style.removeProperty("--walkthrough-coach-height");
    };
  }, [hasContent]);

  useEffect(() => {
    if (!step || !onRoute || !step.target || navigationPending) return;
    let target: HTMLElement | null = null;
    let frame = 0;
    let didScroll = false;
    const selector = step.target;
    const refresh = () => {
      frame = 0;
      const found = locateGuideTarget(selector);
      if (found === target) return;
      if (target) target.removeAttribute("data-guide-highlight");
      target = found;
      setTargetFound(Boolean(found));
      if (found) {
        found.setAttribute("data-guide-highlight", "true");
        if (!didScroll && !found.matches(".jarvis-page-viewport, .jarvis-desktop-sidebar, .jarvis-mobile-nav")) {
          didScroll = true;
          found.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        }
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(refresh); };
    const observer = new MutationObserver(schedule);
    const shell = document.querySelector(".app-shell");
    if (shell) observer.observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-expanded"] });
    window.addEventListener("resize", schedule);
    function action(event: Event) {
      if (!target || !(event.target instanceof Node) || !target.contains(event.target)) return;
      if (event.type === "input" && event.target instanceof HTMLInputElement && !event.target.value.trim()) return;
      setPracticed(true);
    }
    if (step.event) document.addEventListener(step.event, action, true);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (step.event) document.removeEventListener(step.event, action, true);
      if (frame) window.cancelAnimationFrame(frame);
      target?.removeAttribute("data-guide-highlight");
    };
  }, [step, onRoute, navigationPending]);

  if (!hasContent) return null;
  if (!active || !guide || !step) {
    if (!notice) return null;
    const returning = Boolean(progress.guides[notice.id]);
    return (
      <aside ref={dockRef} className="walkthrough-coach walkthrough-nudge" aria-label="Optional walkthrough reminder" data-no-pull-refresh="true">
        <div className="min-w-0"><p className="theme-text text-sm font-semibold">{returning ? "Pick up where you left off?" : "Want a hand with this page?"}</p><p className="theme-muted text-xs">{notice.title} · {notice.minutes} min</p></div>
        <button type="button" className="theme-button-primary rounded-xl px-3 py-2 text-sm" onClick={() => start(notice.id)}>{returning ? "Resume" : "Show me"}</button>
        <button type="button" className="theme-button-secondary rounded-xl px-3 py-2 text-sm" onClick={dismissNotice}>Not now</button>
      </aside>
    );
  }

  return (
    <aside ref={dockRef} className={"walkthrough-coach " + (collapsed ? "is-collapsed" : "")} data-no-pull-refresh="true" aria-label="Interactive walkthrough" aria-busy={navigationPending}>
      <div className="walkthrough-coach-heading">
        <div className="min-w-0">
          <p className="theme-muted text-xs">{guide.title} · {active.step + 1} of {guide.steps.length}</p>
          {!collapsed && <h2 aria-live="polite" className="theme-text mt-1 text-base font-semibold">{navigationPending ? "Opening the next step…" : onRoute ? step.title : "Your guide is paused"}</h2>}
        </div>
        <button type="button" onClick={() => setCollapsed((current) => !current)} className="theme-button-secondary shrink-0 rounded-xl px-3 py-2 text-xs" aria-expanded={!collapsed}>{collapsed ? "Show guide" : "Minimize"}</button>
        {collapsed && <button type="button" className="theme-button-secondary shrink-0 rounded-xl px-3 py-2 text-xs" onClick={() => skip()}>Pause</button>}
      </div>
      {!collapsed && (
        <>
          <div className="walkthrough-coach-body">
            {onRoute ? <StepDescription step={step} /> : <p className="theme-muted text-sm leading-5">You can explore freely. Return to the guide’s page to continue from this step.</p>}
            {onRoute && step.practice && <p className="theme-text mt-2 text-sm leading-5">{step.practice}</p>}
            {onRoute && step.event && <p role="status" className="theme-muted mt-1 text-xs">{practiced ? "✓ You tried it. Continue when you are ready." : targetFound ? "The highlighted control is ready. You can also continue without trying it." : "Read the guidance here, then continue when ready."}</p>}
          </div>
          <div className="walkthrough-coach-footer">
            <label className="theme-muted flex min-h-11 cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={permanent} onChange={(event) => setGuideNeverSuggest(active.id, event.target.checked)} className="h-4 w-4 shrink-0" />
              I’ve got it. Don’t suggest this guide again.
            </label>
            <div className="walkthrough-coach-actions">
              <button type="button" onClick={() => skip(permanent)} className="theme-button-secondary rounded-xl px-3 py-2 text-sm">{permanent ? "Dismiss guide" : "Skip for now"}</button>
              <button type="button" onClick={() => advance(-1)} disabled={active.step === 0} className="theme-button-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">Back</button>
              {!onRoute ? <button type="button" onClick={() => router.push(step.route)} className="theme-button-primary rounded-xl px-3 py-2 text-sm font-semibold">Return to step</button> : (
                <button type="button" disabled={navigationPending} onClick={active.step === guide.steps.length - 1 ? finish : () => advance(1)} className="theme-button-primary rounded-xl px-3 py-2 text-sm font-semibold">{active.step === guide.steps.length - 1 ? "Finish guide" : "Next"}</button>
              )}
              <button type="button" onClick={browse} className="walkthrough-all-guides theme-button-secondary rounded-xl px-3 py-2 text-sm">All guides</button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function StepDescription({ step }: { step: GuideStep }) {
  return (
    <>
      <p className={"theme-muted text-sm leading-5 " + (step.compactBody ? "hidden lg:block" : "")}>{step.body}</p>
      {step.compactBody && <p className="theme-muted text-sm leading-5 lg:hidden">{step.compactBody}</p>}
    </>
  );
}

function locateGuideTarget(selector: string): HTMLElement | null {
  for (const part of selector.split(",").map((value) => value.trim())) {
    const match = Array.from(document.querySelectorAll<HTMLElement>(part)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest('[inert], [aria-hidden="true"]');
    });
    if (match) return match;
  }
  return null;
}
