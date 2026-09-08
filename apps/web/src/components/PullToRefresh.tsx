"use client";

import { useEffect, useRef, type RefObject } from "react";

import { useJarvisState } from "@/lib/jarvisStore";

const REFRESH_GESTURE_DISTANCE = 64;
const MAX_VISUAL_OFFSET = 46;
const SETTLE_DURATION_MS = 280;
const PULL_REFRESH_EVENT = "jarvis:pull-refresh";

type PullToRefreshProps = {
  viewportRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
};

/** Moves the page itself with the gesture, then refreshes behind the spring-back. */
export function PullToRefresh({ viewportRef, contentRef }: PullToRefreshProps) {
  const { refreshRemoteState, syncStatus } = useJarvisState();
  const refreshRef = useRef(refreshRemoteState);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const pullDistanceRef = useRef(0);
  const trackingRef = useRef(false);
  const refreshingRef = useRef(false);
  const blockedRef = useRef(false);
  const motionFrameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    refreshRef.current = refreshRemoteState;
  }, [refreshRemoteState]);

  useEffect(() => {
    blockedRef.current =
      syncStatus.local === "loading" ||
      syncStatus.remote === "saving" ||
      syncStatus.remote === "refreshing" ||
      refreshingRef.current;
  }, [syncStatus.local, syncStatus.remote]);

  useEffect(() => {
    const currentViewport = viewportRef.current;
    const currentContent = contentRef.current;
    if (!currentViewport || !currentContent) return;
    const viewport: HTMLElement = currentViewport;
    const content: HTMLDivElement = currentContent;

    function clearMotionTimers() {
      if (motionFrameRef.current) {
        window.cancelAnimationFrame(motionFrameRef.current);
        motionFrameRef.current = null;
      }
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    }

    function clearTracking() {
      startRef.current = null;
      pullDistanceRef.current = 0;
      trackingRef.current = false;
    }

    function prepareContentMotion() {
      clearMotionTimers();
      content.style.transition = "none";
      content.style.willChange = "transform";
    }

    function moveContent(rawDistance: number) {
      pullDistanceRef.current = rawDistance;
      if (motionFrameRef.current) return;
      motionFrameRef.current = window.requestAnimationFrame(() => {
        motionFrameRef.current = null;
        const offset = getPullOffset(pullDistanceRef.current);
        content.style.transform = `translate3d(0, ${offset}px, 0)`;
      });
    }

    function settleContent() {
      if (motionFrameRef.current) {
        window.cancelAnimationFrame(motionFrameRef.current);
        motionFrameRef.current = null;
        const offset = getPullOffset(pullDistanceRef.current);
        content.style.transform = `translate3d(0, ${offset}px, 0)`;
      }

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduceMotion ? 0 : SETTLE_DURATION_MS;
      content.style.transition = duration
        ? `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`
        : "none";
      motionFrameRef.current = window.requestAnimationFrame(() => {
        motionFrameRef.current = null;
        content.style.transform = "translate3d(0, 0, 0)";
      });
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        content.style.removeProperty("transition");
        content.style.removeProperty("transform");
        content.style.removeProperty("will-change");
      }, duration + 40);
    }

    function cancelGesture() {
      settleContent();
      clearTracking();
    }

    function handleTouchStart(event: TouchEvent) {
      if (
        event.touches.length !== 1 ||
        viewport.scrollTop > 0 ||
        blockedRef.current ||
        settleTimerRef.current !== null ||
        !canStartRefreshGesture(event.target, viewport)
      ) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      prepareContentMotion();
      startRef.current = { x: touch.clientX, y: touch.clientY };
      pullDistanceRef.current = 0;
      trackingRef.current = true;
    }

    function handleTouchMove(event: TouchEvent) {
      const start = startRef.current;
      const touch = event.touches[0];
      if (!trackingRef.current || !start || event.touches.length !== 1 || !touch) return;

      const deltaY = touch.clientY - start.y;
      const deltaX = touch.clientX - start.x;
      if (Math.abs(deltaX) > Math.max(18, Math.abs(deltaY) * 1.15) || deltaY <= 0) {
        cancelGesture();
        return;
      }
      if (viewport.scrollTop > 0) {
        cancelGesture();
        return;
      }

      if (deltaY > 7) event.preventDefault();
      moveContent(deltaY);
    }

    function handleTouchEnd() {
      if (!trackingRef.current) return;
      const shouldRefresh = pullDistanceRef.current >= REFRESH_GESTURE_DISTANCE;
      settleContent();
      clearTracking();
      viewport.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (!shouldRefresh) return;

      refreshingRef.current = true;
      blockedRef.current = true;
      announcePullRefresh(true);
      void refreshRef.current({ silent: true }).finally(() => {
        refreshingRef.current = false;
        blockedRef.current = false;
        announcePullRefresh(false);
        viewport.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    }

    viewport.addEventListener("touchstart", handleTouchStart, { passive: true });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: false });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", cancelGesture);
    return () => {
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", cancelGesture);
      clearMotionTimers();
      content.style.removeProperty("transition");
      content.style.removeProperty("transform");
      content.style.removeProperty("will-change");
      if (refreshingRef.current) announcePullRefresh(false);
    };
  }, [contentRef, viewportRef]);

  return null;
}

function getPullOffset(distance: number) {
  const easedDistance = Math.max(0, distance - 4);
  const offset = MAX_VISUAL_OFFSET * (1 - Math.exp(-easedDistance / 62));
  return Math.round(Math.min(MAX_VISUAL_OFFSET, offset) * 10) / 10;
}

function canStartRefreshGesture(target: EventTarget | null, viewport: Element) {
  if (typeof window === "undefined" || viewport.scrollTop > 0) return false;
  if (!window.matchMedia("(max-width: 1023px)").matches) return false;
  const element = target instanceof Element ? target : null;
  if (
    element?.closest(
      'a, button, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-pull-refresh="true"], .jarvis-mobile-nav, .mobile-sidebar, .mobile-sidebar-overlay',
    )
  ) {
    return false;
  }

  const scrollableAncestor = findScrollableAncestor(element, viewport);
  return !scrollableAncestor || scrollableAncestor.scrollTop <= 0;
}

function findScrollableAncestor(element: Element | null, viewport: Element) {
  let current = element?.parentElement ?? null;
  while (current && current !== viewport && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const canScroll =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function announcePullRefresh(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PULL_REFRESH_EVENT, { detail: { active } }));
}
