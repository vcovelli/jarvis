"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GuideStep } from "@/lib/userGuides";
import { intersectGuideRects, positionGuide, type GuidePosition, type GuideRect } from "@/lib/walkthroughPosition";

type SpotlightLayout = { bounds: GuideRect; position: GuidePosition };

/** Optional anchored layer shared by quick start and feature-specific guides. */
export function WalkthroughSpotlight({ step, onPractice, onTargetFound }: {
  step: GuideStep; onPractice: (value: boolean) => void; onTargetFound: (value: boolean) => void;
}) {
  const hintId = useId();
  const hintRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<SpotlightLayout | null>(null);

  useEffect(() => {
    if (!step.target) return;
    let target: HTMLElement | null = null;
    let frame = 0, didScroll = false;
    const selector = step.target;
    const page = document.querySelector<HTMLElement>(".jarvis-page-viewport");
    const dock = document.querySelector<HTMLElement>(".walkthrough-coach");
    const resize = new ResizeObserver(schedule);
    if (page) resize.observe(page);
    if (dock) resize.observe(dock);

    function releaseTarget() {
      if (!target) return;
      target.removeAttribute("data-guide-highlight");
      target.removeAttribute("data-guide-anchored");
      const describedBy = target.getAttribute("aria-describedby")?.split(/\s+/).filter((id) => id !== hintId).join(" ");
      if (describedBy) target.setAttribute("aria-describedby", describedBy);
      else target.removeAttribute("aria-describedby");
      resize.unobserve(target);
      target = null;
    }
    function refresh() {
      frame = 0;
      const candidate = locateGuideTarget(selector);
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], dialog[open]')).filter(isVisible);
      const modalOpen = dialogs.some((dialog) => !(step.shell && dialog.matches("[data-guide-shell]") && candidate && dialog.contains(candidate)));
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
      if (!target || !step.anchor || !page) { setLayout(null); return; }
      const visual = window.visualViewport;
      const surface = step.shell ? target.closest<HTMLElement>("[data-guide-shell], .jarvis-desktop-sidebar") : page;
      let bounds: GuideRect | null = surface ? intersectGuideRects(surface.getBoundingClientRect(), {
        left: visual?.offsetLeft ?? 0, top: visual?.offsetTop ?? 0,
        width: visual?.width ?? innerWidth, height: visual?.height ?? innerHeight,
      }) : null;
      // The mobile coach is inside the drawer. Keep its tips above that row.
      if (bounds && dock && surface?.contains(dock)) {
        const dockRect = dock.getBoundingClientRect();
        bounds = dockRect.left > bounds.left + bounds.width / 3
          ? { ...bounds, width: dockRect.left - bounds.left }
          : { ...bounds, height: Math.max(0, Math.min(bounds.top + bounds.height, dockRect.top) - bounds.top) };
      }
      // Clip the highlight to nested scrollers, but give the tooltip the whole
      // surface to fit in. A tightly fitted control group still gets a pointer.
      let visibleTarget: GuideRect | null = target.getBoundingClientRect();
      for (let parent = target.parentElement; visibleTarget && parent && parent !== surface; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflow)) visibleTarget = intersectGuideRects(visibleTarget, parent.getBoundingClientRect());
      }
      const sectionNav = !step.shell ? page.querySelector<HTMLElement>(".mobile-section-nav") : null;
      if (bounds && sectionNav && isVisible(sectionNav) && !sectionNav.contains(target)) {
        const navRect = sectionNav.getBoundingClientRect();
        const top = Math.max(bounds.top, navRect.bottom);
        bounds = { ...bounds, top, height: Math.max(0, bounds.top + bounds.height - top) };
      }
      const size = { width: Math.min(248, (bounds?.width ?? 0) - 16), height: hintRef.current?.offsetHeight ?? 56 };
      const position = bounds && visibleTarget ? positionGuide(visibleTarget, bounds, size, step.anchor.placement) : null;
      const next = bounds && position ? { bounds, position } : null;
      setLayout((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
      const ids = new Set(target.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean));
      if (position?.tooltip) ids.add(hintId); else ids.delete(hintId);
      if (ids.size) target.setAttribute("aria-describedby", Array.from(ids).join(" "));
      else target.removeAttribute("aria-describedby");
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(refresh); }
    function action(event: Event) {
      if (!target || !(event.target instanceof Element) || !isVisible(target)) return;
      const inControl = step.interactionTarget ? event.target.closest(step.interactionTarget) : target?.contains(event.target);
      if (!inControl) return;
      if (event.type === "input" && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) && !event.target.value.trim()) return;
      onPractice(true);
    }
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-hidden", "aria-expanded", "style"] });
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    if (step.event) document.addEventListener(step.event, action, true);
    schedule();
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (step.event) document.removeEventListener(step.event, action, true);
      if (frame) window.cancelAnimationFrame(frame);
      releaseTarget();
    };
  }, [step, hintId, onPractice, onTargetFound]);

  const tooltipVisible = Boolean(layout?.position.tooltip);
  // Re-measure wrapped text after the first paint and when bounds change.
  useEffect(() => {
    if (!hintRef.current) return;
    const observer = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
    observer.observe(hintRef.current);
    return () => observer.disconnect();
  }, [tooltipVisible]);

  if (!layout || !step.anchor) return null;
  const { bounds, position: { highlight, tooltip } } = layout;
  const verticalArrow = tooltip?.placement === "top" || tooltip?.placement === "bottom";
  return createPortal(
    <>
      <div className="walkthrough-spotlight" aria-hidden="true" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}>
        <div className="walkthrough-spotlight-ring" style={{ left: highlight.left - bounds.left, top: highlight.top - bounds.top, width: highlight.width, height: highlight.height }} />
      </div>
      {tooltip && <div ref={hintRef} id={hintId} role="tooltip" className="walkthrough-anchor" data-placement={tooltip.placement} style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}>
        {step.anchor.label}
        <span className="walkthrough-anchor-arrow" aria-hidden="true" style={verticalArrow ? { left: tooltip.arrow } : { top: tooltip.arrow }} />
      </div>}
    </>, (step.shell ? document.querySelector("[data-guide-shell]") : null) ?? document.body,
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
