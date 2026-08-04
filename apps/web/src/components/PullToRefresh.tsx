"use client";

import { useEffect, useRef, useState } from "react";

import { useJarvisState } from "@/lib/jarvisStore";

const TRIGGER_DISTANCE = 76;
const MAX_PULL_DISTANCE = 126;
const MIN_REFRESH_VISIBLE_MS = 520;
const PULL_START_MAX_Y = 124;

export function PullToRefresh() {
  const { refreshRemoteState, syncStatus } = useJarvisState();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const trackingRef = useRef(false);
  const readyRef = useRef(false);
  const refreshRef = useRef(refreshRemoteState);

  useEffect(() => {
    refreshRef.current = refreshRemoteState;
  }, [refreshRemoteState]);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    function resetPull() {
      startYRef.current = null;
      trackingRef.current = false;
      readyRef.current = false;
      setPullDistance(0);
    }

    function handleTouchStart(event: TouchEvent) {
      if (
        event.touches.length !== 1 ||
        syncStatus.remote === "saving" ||
        syncStatus.remote === "refreshing"
      ) {
        return;
      }
      const startY = event.touches[0]?.clientY ?? null;
      if (startY === null || startY > PULL_START_MAX_Y) return;
      if (!canStartPull(event.target)) return;
      startYRef.current = startY;
      trackingRef.current = true;
      readyRef.current = false;
    }

    function handleTouchMove(event: TouchEvent) {
      if (!trackingRef.current || startYRef.current === null || event.touches.length !== 1) return;
      if (!canStartPull(event.target)) {
        resetPull();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? startYRef.current;
      const delta = currentY - startYRef.current;
      if (delta <= 0) {
        resetPull();
        return;
      }

      if (delta > 6) event.preventDefault();
      const easedDistance = rubberBand(delta);
      setPullDistance(easedDistance);

      const isReady = easedDistance >= TRIGGER_DISTANCE;
      if (isReady && !readyRef.current) pulse([8, 20, 8]);
      readyRef.current = isReady;
    }

    function handleTouchEnd() {
      if (!trackingRef.current) return;
      const shouldRefresh = pullDistanceRef.current >= TRIGGER_DISTANCE;
      startYRef.current = null;
      trackingRef.current = false;
      readyRef.current = false;

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      setPullDistance(TRIGGER_DISTANCE);
      setRefreshing(true);
      pulse([10, 26, 10]);
      const startedAt = performance.now();

      void refreshRef.current().finally(() => {
        const elapsed = performance.now() - startedAt;
        window.setTimeout(() => {
          setRefreshing(false);
          setPullDistance(0);
        }, Math.max(0, MIN_REFRESH_VISIBLE_MS - elapsed));
      });
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", resetPull);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", resetPull);
    };
  }, [syncStatus.remote]);

  const isRefreshing = refreshing || syncStatus.remote === "refreshing";
  const visible = pullDistance > 0 || isRefreshing;
  const progress = isRefreshing ? 1 : Math.min(pullDistance / TRIGGER_DISTANCE, 1);
  const displayDistance = isRefreshing ? TRIGGER_DISTANCE : pullDistance;
  const ready = progress >= 1;
  const label = isRefreshing ? "Syncing" : ready ? "Release" : "Pull";

  return (
    <div
      className={
        "pointer-events-none fixed inset-x-0 z-[60] flex justify-center transition-[opacity,transform] duration-300 ease-out lg:hidden " +
        (visible ? "opacity-100" : "opacity-0")
      }
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 0.35rem)",
        transform: `translate3d(0, ${Math.min(displayDistance, TRIGGER_DISTANCE)}px, 0) scale(${visible ? 1 : 0.94})`,
      }}
      role="status"
      aria-live="polite"
      aria-label={isRefreshing ? "Refreshing state" : "State refresh gesture"}
    >
      <div className="flex h-11 items-center gap-2 rounded-full border border-cyan-200/25 bg-slate-950/88 px-2.5 pr-3.5 shadow-[0_14px_34px_rgba(2,6,23,0.38)] backdrop-blur-2xl">
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/8">
          <span
            className={"absolute inset-0 rounded-full " + (isRefreshing ? "animate-spin" : "")}
            style={{
              background: `conic-gradient(rgb(103 232 249) ${Math.round(progress * 360)}deg, rgba(148,163,184,0.22) 0deg)`,
            }}
          />
          <span className="relative h-[1.22rem] w-[1.22rem] rounded-full bg-slate-950/95" />
          <span className="absolute h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.6)]" />
        </span>
        <span className="text-[12px] font-semibold text-cyan-50">{label}</span>
      </div>
    </div>
  );
}

function rubberBand(distance: number) {
  const base = distance * 0.66;
  const extra = distance > TRIGGER_DISTANCE ? (distance - TRIGGER_DISTANCE) * 0.18 : 0;
  return Math.min(MAX_PULL_DISTANCE, Math.round(base + extra));
}

function canStartPull(target: EventTarget | null) {
  if (typeof window === "undefined" || window.scrollY > 0) return false;
  const element = target instanceof Element ? target : null;
  if (
    element?.closest(
      'a, button, input, textarea, select, [role="button"], [contenteditable="true"], [data-no-pull-refresh="true"], .jarvis-mobile-nav, .mobile-sidebar, .mobile-sidebar-overlay',
    )
  ) {
    return false;
  }

  const scrollableAncestor = findScrollableAncestor(element);
  return !scrollableAncestor || scrollableAncestor.scrollTop <= 0;
}

function findScrollableAncestor(element: Element | null) {
  let current = element?.parentElement ?? null;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const canScroll =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return null;
}

function pulse(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  const haptics = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  haptics.vibrate?.(pattern);
}
