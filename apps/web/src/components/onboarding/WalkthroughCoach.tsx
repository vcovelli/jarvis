"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { findGuide, guideStepSuccess, matchesGuideRoute, type GuideStep } from "@/lib/userGuides";
import { useMobileLayout } from "@/lib/useMobileLayout";
import { WalkthroughSpotlight, type WalkthroughPracticePhase, type WalkthroughTargetRect } from "./WalkthroughSpotlight";
import { useWalkthrough } from "./WalkthroughProvider";

type PracticeState = "intro" | "waiting" | "started" | "complete";
type CoachPosition = { left: number; top: number };

export function WalkthroughCoach({ inMobileSidebar = false }: { inMobileSidebar?: boolean }) {
  const { active } = useWalkthrough();
  const pathname = usePathname();
  const mobile = useMobileLayout();
  const step = active ? findGuide(active.id)?.steps[active.step] : undefined;
  const inDrawer = Boolean(mobile && step?.shell && matchesGuideRoute(pathname, step.route));
  if (inMobileSidebar !== inDrawer) return null;
  return <CoachContent key={(active ? active.id + ":" + active.step : "closed") + pathname} />;
}

function CoachContent() {
  const { ready, navigationPending, active, advance, finish, skip, browse } = useWalkthrough();
  const pathname = usePathname();
  const router = useRouter();
  const headingId = useId();
  const descriptionId = useId();
  const coachRef = useRef<HTMLElement>(null);
  const practiceStateRef = useRef<PracticeState>("intro");
  const [practiceState, setPracticeState] = useState<PracticeState>("intro");
  const [targetFound, setTargetFound] = useState(false);
  const [targetRect, setTargetRect] = useState<WalkthroughTargetRect | null>(null);
  const [coachPosition, setCoachPosition] = useState<CoachPosition | null>(null);
  const guide = active ? findGuide(active.id) : undefined;
  const step = guide && active ? guide.steps[active.step] : undefined;
  const onRoute = Boolean(step && matchesGuideRoute(pathname, step.route));
  const hasContent = ready && Boolean(active);
  const finalStep = Boolean(active && guide && active.step === guide.steps.length - 1);

  const changePracticeState = useCallback((next: PracticeState) => {
    practiceStateRef.current = next;
    setPracticeState(next);
  }, []);

  const moveForward = useCallback(() => {
    if (finalStep) finish();
    else advance(1);
  }, [advance, finalStep, finish]);

  const handlePractice = useCallback((phase: WalkthroughPracticePhase) => {
    if (practiceStateRef.current === "complete") return;
    changePracticeState(phase === "started" ? "started" : "complete");
  }, [changePracticeState]);

  const handleTargetRect = useCallback((next: WalkthroughTargetRect | null) => {
    if (!next) setCoachPosition(null);
    setTargetRect((current) => {
      if (!current || !next) return current === next ? current : next;
      const unchanged = Math.abs(current.left - next.left) < 0.5
        && Math.abs(current.top - next.top) < 0.5
        && Math.abs(current.width - next.width) < 0.5
        && Math.abs(current.height - next.height) < 0.5;
      return unchanged ? current : next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!targetRect || !coachRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const coach = coachRef.current;
      if (!coach) return;
      const visual = window.visualViewport;
      const viewportLeft = visual?.offsetLeft ?? 0;
      const viewportTop = visual?.offsetTop ?? 0;
      const viewportWidth = visual?.width ?? window.innerWidth;
      const viewportHeight = visual?.height ?? window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;
      const { width, height } = coach.getBoundingClientRect();
      const margin = 10;
      const gap = 12;
      const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
      let left: number;
      let top: number;

      if (viewportWidth >= 1024 && viewportRight - (targetRect.left + targetRect.width) >= width + gap + margin) {
        left = targetRect.left + targetRect.width + gap;
        top = targetRect.top + (targetRect.height - height) / 2;
      } else if (viewportWidth >= 1024 && targetRect.left - viewportLeft >= width + gap + margin) {
        left = targetRect.left - width - gap;
        top = targetRect.top + (targetRect.height - height) / 2;
      } else {
        left = targetRect.left + (targetRect.width - width) / 2;
        const roomBelow = viewportBottom - (targetRect.top + targetRect.height);
        const roomAbove = targetRect.top - viewportTop;
        top = roomBelow >= height + gap || roomBelow >= roomAbove
          ? targetRect.top + targetRect.height + gap
          : targetRect.top - height - gap;
      }

      setCoachPosition({
        left: clamp(left, viewportLeft + margin, viewportRight - width - margin),
        top: clamp(top, viewportTop + margin, viewportBottom - height - margin),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [targetRect, practiceState]);

  useEffect(() => {
    if (!hasContent) return;
    document.body.dataset.walkthroughActive = "true";
    return () => { delete document.body.dataset.walkthroughActive; };
  }, [hasContent]);

  useEffect(() => {
    if (!hasContent) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')).some((element) => element !== coachRef.current && element.getClientRects().length > 0)) return;
      event.preventDefault();
      skip();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [hasContent, skip]);

  if (!hasContent || !active || !guide || !step) return null;

  const actionPrompt = step.practice ?? step.anchor?.label;
  const interactionRequired = Boolean(onRoute && step.event && targetFound);
  const progress = ((active.step + (practiceState === "complete" ? 1 : 0)) / guide.steps.length) * 100;
  const chapter = guide.id === "essentials" ? chapterForRoute(step.route) : guide.title;
  const stateLabel = practiceState === "intro"
    ? step.event ? "Learn · 1 of 3" : "Guided note"
    : practiceState === "complete"
      ? "Got it · 3 of 3"
      : practiceState === "started"
        ? "Try it · input detected"
        : "Try it · 2 of 3";
  const success = guideStepSuccess(guide.id, step);

  return (
    <aside
      ref={coachRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className={"walkthrough-coach theme-modal " + (coachPosition ? "is-positioned " : "") + (practiceState === "complete" ? "is-complete" : "")}
      style={coachPosition ?? undefined}
      data-no-pull-refresh="true"
      data-practice-state={practiceState}
      aria-busy={navigationPending}
    >
      {onRoute && !navigationPending && (
        <WalkthroughSpotlight step={step} onPractice={handlePractice} onTargetFound={setTargetFound} onTargetRect={handleTargetRect} />
      )}

      <div className="walkthrough-coach-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      <div className="walkthrough-coach-heading">
        <div>
          <p className="walkthrough-coach-state"><span>{stateLabel}</span></p>
          <p className="theme-muted walkthrough-coach-count">{chapter} · Step {active.step + 1} of {guide.steps.length}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={browse} className="walkthrough-coach-icon" aria-label="Open all guides">Guides</button>
          <button type="button" onClick={skip} className="walkthrough-coach-close" aria-label="Exit walkthrough">×</button>
        </div>
      </div>

      <h2 id={headingId} aria-live="polite" className="theme-text walkthrough-coach-title">
        {navigationPending ? "Opening the next step…" : practiceState === "complete" ? "What you just learned" : onRoute ? step.title : "Your guide is paused"}
      </h2>
      <div id={descriptionId} className="walkthrough-coach-body">
        {!onRoute ? (
          <p className="theme-muted text-sm leading-5">Return to this step when you’re ready. Your place is saved.</p>
        ) : practiceState === "intro" ? (
          <StepDescription step={step} />
        ) : practiceState === "complete" ? (
          <div className="walkthrough-coach-takeaway"><span aria-hidden="true">✓</span><p>{success}</p></div>
        ) : (
          <>
            {actionPrompt && <div className="walkthrough-coach-prompt"><span aria-hidden="true">→</span><p>{actionPrompt}</p></div>}
            <p role="status" aria-live="polite" className="walkthrough-coach-feedback">
              {practiceState === "started" ? "I see it. Finish your thought; I’ll mark the action complete when you pause." : targetFound ? "Use the highlighted control. I’ll notice when you do." : "That control is not visible right now."}
            </p>
          </>
        )}
      </div>

      <div className="walkthrough-coach-footer">
        {practiceState === "intro" && active.step > 0 && (
          <button type="button" onClick={() => advance(-1)} disabled={navigationPending} className="theme-button-secondary rounded-xl px-3 py-2 text-sm disabled:opacity-40">Previous</button>
        )}
        {(practiceState === "waiting" || practiceState === "started") && (
          <button type="button" onClick={() => changePracticeState("intro")} className="theme-button-secondary rounded-xl px-3 py-2 text-sm">Explain again</button>
        )}
        {!onRoute ? (
          <button type="button" onClick={() => router.push(step.route)} className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold">Return</button>
        ) : practiceState === "intro" ? (
          interactionRequired
            ? <button type="button" onClick={() => changePracticeState("waiting")} className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold">Show me</button>
            : <button type="button" onClick={moveForward} disabled={navigationPending} className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold">{finalStep ? "Finish guide" : "Next"}</button>
        ) : practiceState === "complete" ? (
          <button type="button" onClick={moveForward} disabled={navigationPending} className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold">{finalStep ? "Finish guide" : "Next step"}</button>
        ) : !targetFound ? (
          <button type="button" onClick={moveForward} className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold">Skip step</button>
        ) : null}
      </div>
    </aside>
  );
}

function StepDescription({ step }: { step: GuideStep }) {
  return (
    <>
      <p className={"walkthrough-coach-explanation theme-muted text-sm leading-5 " + (step.compactBody ? "hidden lg:block" : "")}>{step.body}</p>
      {step.compactBody && <p className="walkthrough-coach-explanation theme-muted text-sm leading-5 lg:hidden">{step.compactBody}</p>}
      {step.event && <p className="walkthrough-coach-ready">When this makes sense, choose <strong>Show me</strong>. Then use the highlighted control yourself.</p>}
    </>
  );
}

function chapterForRoute(route: string): string {
  const path = route.split("?")[0];
  if (path === "/v2") return "Get oriented";
  if (path.endsWith("/must-win")) return "Set direction";
  if (path.endsWith("/daily")) return "Plan the day";
  if (path.endsWith("/habits")) return "Build routines";
  if (path.endsWith("/sleep")) return "Understand recovery";
  if (path.endsWith("/mood")) return "Add context";
  if (path.endsWith("/review")) return "Learn from the day";
  return "Guided first day";
}
