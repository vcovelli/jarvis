"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { findGuide, matchesGuideRoute, type GuideStep } from "@/lib/userGuides";
import { useMobileLayout } from "@/lib/useMobileLayout";
import { WalkthroughSpotlight } from "./WalkthroughSpotlight";
import { useWalkthrough } from "./WalkthroughProvider";

export function WalkthroughCoach({ inMobileSidebar = false }: { inMobileSidebar?: boolean }) {
  const { active } = useWalkthrough();
  const pathname = usePathname();
  const mobile = useMobileLayout();
  const step = active ? findGuide(active.id)?.steps[active.step] : undefined;
  const inDrawer = Boolean(mobile && step?.shell && matchesGuideRoute(pathname, step.route));
  // The mobile theme tour lives inside the drawer's keyboard focus boundary.
  if (inMobileSidebar !== inDrawer) return null;
  return <CoachContent key={(active ? active.id + ":" + active.step : "closed") + pathname} />;
}

function CoachContent() {
  const { ready, navigationPending, active, advance, finish, skip, browse, storageAvailable } = useWalkthrough();
  const pathname = usePathname();
  const router = useRouter();
  const headingId = useId();
  const dockRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [practiced, setPracticed] = useState(false);
  const [targetFound, setTargetFound] = useState(false);
  const guide = active ? findGuide(active.id) : undefined;
  const step = guide && active ? guide.steps[active.step] : undefined;
  const onRoute = Boolean(step && matchesGuideRoute(pathname, step.route));
  const hasContent = ready && Boolean(active);

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
    if (!hasContent) return;
    // Keep keyboard progression usable after the previous step unmounts.
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) nextRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [hasContent]);

  useEffect(() => {
    if (!hasContent) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Editors and the mobile menu own Escape while their dialog is open.
      if (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')).some((element) => element.getClientRects().length > 0)) return;
      event.preventDefault();
      skip();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [hasContent, skip]);

  if (!hasContent || !active || !guide || !step) return null;

  return (
    <aside ref={dockRef} className={"walkthrough-coach " + (collapsed ? "is-collapsed" : "")} data-no-pull-refresh="true" aria-label="Interactive walkthrough" aria-busy={navigationPending}>
      {onRoute && !collapsed && !navigationPending && <WalkthroughSpotlight step={step} onPractice={setPracticed} onTargetFound={setTargetFound} />}
      <div className="walkthrough-coach-heading">
        <div className="min-w-0">
          <p className="theme-muted text-xs">{guide.title} · {active.step + 1} of {guide.steps.length}</p>
          {!collapsed && <h2 id={headingId} aria-live="polite" className="theme-text mt-1 text-base font-semibold">{navigationPending ? "Opening the next step…" : onRoute ? step.title : "Your guide is paused"}</h2>}
        </div>
        <button type="button" onClick={() => setCollapsed((current) => !current)} className="theme-button-secondary shrink-0 rounded-xl px-3 py-2 text-xs" aria-expanded={!collapsed}>{collapsed ? "Show guide" : "Minimize"}</button>
        {collapsed && <button type="button" className="theme-button-secondary shrink-0 rounded-xl px-3 py-2 text-xs" onClick={skip}>Close tour</button>}
      </div>
      {!collapsed && (
        <>
          <div className="walkthrough-coach-body">
            {onRoute ? <StepDescription step={step} /> : <p className="theme-muted text-sm leading-5">You can explore freely. Return to this step when you’re ready, or close the tour and resume from User guide.</p>}
            {onRoute && step.practice && <p className="theme-text mt-2 text-sm leading-5">{step.practice}</p>}
            {onRoute && step.event && <p role="status" className="theme-muted mt-1 text-xs">{practiced ? "✓ Tried it. Choose Next when you’re ready." : targetFound ? "Try the control, or choose Next." : "You can continue whenever you’re ready."}</p>}
          </div>
          <div className="walkthrough-coach-footer">
            <p className="theme-muted text-xs leading-5">{storageAvailable ? "Next saves your place. Closed tips stay closed. Replay in User guide." : "Progress lasts for this visit because browser storage is unavailable."}</p>
            <div className="walkthrough-coach-actions">
              <button type="button" onClick={skip} className="theme-button-secondary rounded-xl px-3 py-2 text-sm">Close tour</button>
              <button type="button" onClick={() => advance(-1)} disabled={active.step === 0 || navigationPending} className="theme-button-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">Back</button>
              {!onRoute ? <button ref={nextRef} aria-describedby={headingId} type="button" onClick={() => router.push(step.route)} className="theme-button-primary rounded-xl px-3 py-2 text-sm font-semibold">Return to step</button> : (
                <button ref={nextRef} aria-describedby={headingId} type="button" disabled={navigationPending} onClick={active.step === guide.steps.length - 1 ? finish : () => advance(1)} className="theme-button-primary rounded-xl px-3 py-2 text-sm font-semibold">{active.step === guide.steps.length - 1 ? "Finish guide" : "Next"}</button>
              )}
              <button type="button" onClick={browse} className="walkthrough-all-guides theme-button-secondary rounded-xl px-3 py-2 text-sm">User guide</button>
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
