"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GuideStep } from "@/lib/userGuides";
import { intersectGuideRects, positionGuide, type GuidePosition, type GuideRect } from "@/lib/walkthroughPosition";

type SpotlightLayout = { bounds: GuideRect; position: GuidePosition };
export type WalkthroughPracticePhase = "started" | "complete";
export type WalkthroughTargetRect = GuideRect;

/** Highlights the live control and reports real interaction back to the coach. */
export function WalkthroughSpotlight({ step, onPractice, onTargetFound, onTargetRect }: {
  step: GuideStep;
  onPractice: (phase: WalkthroughPracticePhase) => void;
  onTargetFound: (value: boolean) => void;
  onTargetRect: (rect: WalkthroughTargetRect | null) => void;
}) {
  const [layout, setLayout] = useState<SpotlightLayout | null>(null);

  useEffect(() => {
    if (!step.target) {
      onTargetFound(false);
      onTargetRect(null);
      return;
    }
    let target: HTMLElement | null = null;
    let frame = 0;
    let inputTimer = 0;
    let didScroll = false;
    const selector = step.target;
    const page = document.querySelector<HTMLElement>(".jarvis-page-viewport");
    const resize = new ResizeObserver(schedule);
    if (page) resize.observe(page);

    function releaseTarget() {
      if (!target) return;
      target.removeAttribute("data-guide-highlight");
      target.removeAttribute("data-guide-anchored");
      resize.unobserve(target);
      target = null;
    }

    function refresh() {
      frame = 0;
      const candidate = locateGuideTarget(selector);
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]'))
        .filter((dialog) => !dialog.matches(".walkthrough-coach") && isVisible(dialog));
      const modalOpen = dialogs.some((dialog) => {
        if (step.shell && dialog.matches("[data-guide-shell]") && candidate && dialog.contains(candidate)) return false;
        return !candidate || (dialog !== candidate && !dialog.contains(candidate));
      });
      const found = modalOpen ? null : candidate;

      if (found !== target) {
        releaseTarget();
        target = found;
        onTargetFound(Boolean(found));
        if (found) {
          found.setAttribute("data-guide-highlight", "true");
          if (step.anchor) found.setAttribute("data-guide-anchored", "true");
          resize.observe(found);
          if (!didScroll && !found.matches(".jarvis-page-viewport, .jarvis-desktop-sidebar, .jarvis-mobile-nav")) {
            didScroll = true;
            found.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
          }
        }
      }

      if (!target || !page) {
        onTargetRect(null);
        setLayout(null);
        return;
      }

      const targetRect = target.getBoundingClientRect();
      onTargetRect({ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height });
      const visual = window.visualViewport;
      const surface = step.shell ? target.closest<HTMLElement>("[data-guide-shell], .jarvis-desktop-sidebar") : page;
      let bounds: GuideRect | null = surface ? intersectGuideRects(surface.getBoundingClientRect(), {
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        width: visual?.width ?? innerWidth,
        height: visual?.height ?? innerHeight,
      }) : null;

      let visibleTarget: GuideRect | null = targetRect;
      for (let parent = target.parentElement; visibleTarget && parent && parent !== surface; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflow)) visibleTarget = intersectGuideRects(visibleTarget, parent.getBoundingClientRect());
      }
      const sectionNav = !step.shell ? page.querySelector<HTMLElement>(".mobile-section-nav") : null;
      if (bounds && sectionNav && isVisible(sectionNav) && !sectionNav.contains(target)) {
        const navRect = sectionNav.getBoundingClientRect();
        const top = Math.max(bounds.top, navRect.bottom);
        bounds = { ...bounds, top, height: Math.max(0, bounds.top + bounds.height - top) };
      }
      const position = bounds && visibleTarget ? positionGuide(visibleTarget, bounds, { width: 1, height: 1 }, step.anchor?.placement) : null;
      const next = bounds && position ? { bounds, position } : null;
      setLayout((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(refresh);
    }

    function action(event: Event) {
      if (!target || !(event.target instanceof Element) || !isVisible(target)) return;
      const inControl = step.interactionTarget ? event.target.closest(step.interactionTarget) : target.contains(event.target);
      if (!inControl) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        if (event.target.type !== "checkbox" && event.target.type !== "radio" && !event.target.value.trim()) {
          window.clearTimeout(inputTimer);
          return;
        }
      }
      if (step.event === "input" && event.type === "input") {
        onPractice("started");
        window.clearTimeout(inputTimer);
        inputTimer = window.setTimeout(() => onPractice("complete"), 700);
        return;
      }
      window.clearTimeout(inputTimer);
      onPractice("complete");
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-hidden", "aria-expanded", "style"] });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    const actionEvents = step.event === "input" ? ["input", "change"] : step.event ? [step.event] : [];
    actionEvents.forEach((eventName) => document.addEventListener(eventName, action, true));
    schedule();

    return () => {
      observer.disconnect();
      resize.disconnect();
      window.clearTimeout(inputTimer);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      actionEvents.forEach((eventName) => document.removeEventListener(eventName, action, true));
      if (frame) window.cancelAnimationFrame(frame);
      releaseTarget();
    };
  }, [step, onPractice, onTargetFound, onTargetRect]);

  if (!layout) return null;
  const { bounds, position: { highlight } } = layout;
  return createPortal(
    <div className="walkthrough-spotlight" aria-hidden="true" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}>
      <div className="walkthrough-spotlight-ring" style={{ left: highlight.left - bounds.left, top: highlight.top - bounds.top, width: highlight.width, height: highlight.height }} />
    </div>,
    (step.shell ? document.querySelector("[data-guide-shell]") : null) ?? document.body,
  );
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest('[inert], [aria-hidden="true"]');
}

function locateGuideTarget(selector: string): HTMLElement | null {
  for (const part of selector.split(",").map((value) => value.trim())) {
    const match = Array.from(document.querySelectorAll<HTMLElement>(part)).find(isVisible);
    if (match) return match;
  }
  return null;
}
