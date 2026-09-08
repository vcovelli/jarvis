"use client";

import { useEffect, useRef, useState } from "react";

import { useJarvisState, type StateSyncStatus } from "@/lib/jarvisStore";

const BUSY_NOTICE_DELAY_MS = 650;
const INITIAL_NOTICE_DELAY_MS = 900;
const SUCCESS_VISIBLE_MS = 900;
const VERSION_STORAGE_KEY = "jarvis-pwa-runtime-version";
const VERSION_CHECK_THROTTLE_MS = 30_000;
const PULL_REFRESH_EVENT = "jarvis:pull-refresh";

type UpdateState = "idle" | "reloading";

export function MobileSyncStatus() {
  const { syncStatus, refreshRemoteState } = useJarvisState();
  const refreshRef = useRef(refreshRemoteState);
  const revealTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const noticeShownRef = useRef<"initial" | "routine" | "urgent" | null>(null);
  const showBusyRef = useRef(false);
  const lastVersionCheckRef = useRef(0);
  const checkingVersionRef = useRef(false);
  const [showBusy, setShowBusy] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [pullRefreshActive, setPullRefreshActive] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");

  useEffect(() => {
    refreshRef.current = refreshRemoteState;
  }, [refreshRemoteState]);

  useEffect(() => {
    if (!isInstalledPwa()) return;
    let active = true;

    async function checkVersion(force = false) {
      const now = Date.now();
      if (
        checkingVersionRef.current ||
        (!force && now - lastVersionCheckRef.current < VERSION_CHECK_THROTTLE_MS)
      ) {
        return;
      }
      checkingVersionRef.current = true;
      lastVersionCheckRef.current = now;

      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        const nextVersion = typeof payload?.version === "string" ? payload.version : null;
        if (!active || !response.ok || !nextVersion) return;

        const knownVersion = window.sessionStorage.getItem(VERSION_STORAGE_KEY);
        if (!knownVersion) {
          window.sessionStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
          return;
        }
        if (knownVersion === nextVersion) return;

        setUpdateState("reloading");
        await refreshRef.current({ silent: true });
        if (!active) return;
        window.sessionStorage.setItem(VERSION_STORAGE_KEY, nextVersion);
        window.setTimeout(() => window.location.reload(), 320);
      } catch {
        // Offline and interrupted checks are represented by the normal sync state.
      } finally {
        checkingVersionRef.current = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void checkVersion();
    }

    function handleOnline() {
      void checkVersion(true);
    }

    function handlePageShow(event: PageTransitionEvent) {
      void checkVersion(event.persisted);
    }

    const initialTimer = window.setTimeout(() => void checkVersion(true), 2800);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  useEffect(() => {
    function handlePullRefresh(event: Event) {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setPullRefreshActive(detail?.active === true);
    }

    window.addEventListener(PULL_REFRESH_EVENT, handlePullRefresh);
    return () => window.removeEventListener(PULL_REFRESH_EVENT, handlePullRefresh);
  }, []);

  useEffect(() => {
    const clearRevealTimer = () => {
      if (!revealTimerRef.current) return;
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    };
    const clearSuccessTimer = () => {
      if (!successTimerRef.current) return;
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    };

    if (pullRefreshActive) {
      clearRevealTimer();
      clearSuccessTimer();
      noticeShownRef.current = null;
      showBusyRef.current = false;
      setShowBusy(false);
      setShowSuccess(false);
      return;
    }

    const urgent = isUrgentSyncState(syncStatus, updateState);
    const busy = isRoutineSyncState(syncStatus, updateState);

    if (urgent) {
      clearRevealTimer();
      clearSuccessTimer();
      noticeShownRef.current = "urgent";
      showBusyRef.current = false;
      setShowBusy(false);
      setShowSuccess(false);
      return;
    }

    if (busy) {
      clearSuccessTimer();
      setShowSuccess(false);
      if (!showBusyRef.current && !revealTimerRef.current) {
        const initialLoad = syncStatus.local === "loading";
        revealTimerRef.current = window.setTimeout(() => {
          revealTimerRef.current = null;
          noticeShownRef.current = initialLoad ? "initial" : "routine";
          showBusyRef.current = true;
          setShowBusy(true);
        }, initialLoad ? INITIAL_NOTICE_DELAY_MS : BUSY_NOTICE_DELAY_MS);
      }
      return;
    }

    clearRevealTimer();
    showBusyRef.current = false;
    setShowBusy(false);
    const shouldConfirm =
      syncStatus.remote === "saved" &&
      (noticeShownRef.current === "routine" || noticeShownRef.current === "urgent");
    noticeShownRef.current = null;
    clearSuccessTimer();
    setShowSuccess(shouldConfirm);
    if (shouldConfirm) {
      successTimerRef.current = window.setTimeout(() => {
        successTimerRef.current = null;
        setShowSuccess(false);
      }, SUCCESS_VISIBLE_MS);
    }
  }, [pullRefreshActive, syncStatus, updateState]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  const presentation = pullRefreshActive
    ? null
    : getMobileSyncPresentation(syncStatus, showBusy, showSuccess, updateState);
  const visible = presentation !== null;

  return (
    <div
      className="mobile-sync-notice fixed inset-x-0 z-[38] flex justify-center px-4 lg:hidden"
      data-visible={visible}
      aria-hidden={!visible}
    >
      {presentation ? (
        <div
          className="theme-workspace-chrome flex min-w-0 max-w-sm items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-xl"
          role="status"
          aria-live="polite"
        >
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${presentation.iconClass}`}>
            <SyncGlyph mode={presentation.icon} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="theme-text block text-[12px] font-semibold leading-4">{presentation.label}</span>
            <span className="theme-muted block text-[10px] leading-4">{presentation.detail}</span>
          </span>
          {presentation.retry ? (
            <button
              type="button"
              onClick={() => void refreshRemoteState()}
              className="theme-chip shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-semibold"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getMobileSyncPresentation(
  syncStatus: StateSyncStatus,
  showBusy: boolean,
  showSuccess: boolean,
  updateState: UpdateState,
) {
  if (updateState === "reloading") {
    return {
      label: "A fresh Jarvis is ready",
      detail: "Saving your work, then reopening the app",
      icon: "spinner" as const,
      iconClass: "theme-accent-text bg-current/10",
      retry: false,
    };
  }
  if (showBusy && syncStatus.local === "loading") {
    return {
      label: "Getting things ready",
      detail: "Restoring your workspace on this phone",
      icon: "spinner" as const,
      iconClass: "theme-accent-text bg-current/10",
      retry: false,
    };
  }
  if (syncStatus.local === "error") {
    return {
      label: "This phone couldn’t save",
      detail: "Keep Jarvis open and try that change again",
      icon: "error" as const,
      iconClass: "text-red-500 bg-red-500/10",
      retry: false,
    };
  }
  if (showBusy && syncStatus.remote === "refreshing") {
    return {
      label: "Checking quietly",
      detail: "You can keep going while Jarvis catches up",
      icon: "spinner" as const,
      iconClass: "theme-accent-text bg-current/10",
      retry: false,
    };
  }
  if (showBusy && syncStatus.remote === "saving") {
    return {
      label: "Saving in the background",
      detail: "Your changes are already safe on this phone",
      icon: "spinner" as const,
      iconClass: "theme-accent-text bg-current/10",
      retry: false,
    };
  }
  if (showBusy && syncStatus.remote === "pending") {
    return {
      label: "Finishing in the background",
      detail: "No need to wait — your changes are safe here",
      icon: "clock" as const,
      iconClass: "text-amber-500 bg-amber-500/10",
      retry: false,
    };
  }
  if (syncStatus.remote === "offline") {
    return {
      label: "Working offline",
      detail: "Changes stay safe here until you reconnect",
      icon: "offline" as const,
      iconClass: "text-amber-500 bg-amber-500/10",
      retry: false,
    };
  }
  if (syncStatus.remote === "error") {
    return {
      label: "Sync needs another try",
      detail: "Your changes are safe on this phone",
      icon: "error" as const,
      iconClass: "text-red-500 bg-red-500/10",
      retry: true,
    };
  }
  if (showSuccess) {
    return {
      label: "All caught up",
      detail: "Everything finished in the background",
      icon: "success" as const,
      iconClass: "text-emerald-500 bg-emerald-500/10",
      retry: false,
    };
  }
  return null;
}

function isRoutineSyncState(syncStatus: StateSyncStatus, updateState: UpdateState) {
  if (updateState === "reloading") return false;
  return (
    syncStatus.local === "loading" ||
    syncStatus.remote === "refreshing" ||
    syncStatus.remote === "saving" ||
    syncStatus.remote === "pending"
  );
}

function isUrgentSyncState(syncStatus: StateSyncStatus, updateState: UpdateState) {
  return (
    updateState === "reloading" ||
    syncStatus.local === "error" ||
    syncStatus.remote === "offline" ||
    syncStatus.remote === "error"
  );
}

function isInstalledPwa() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true;
}

function SyncGlyph({ mode }: { mode: "spinner" | "success" | "clock" | "offline" | "error" }) {
  if (mode === "spinner") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" opacity="0.35" />
        <path d="M17.66 6.34H21V3" />
      </svg>
    );
  }
  if (mode === "success") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m6 12 4 4 8-9" />
      </svg>
    );
  }
  if (mode === "clock") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (mode === "offline") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 3 18 18" />
        <path d="M8.5 8.5A7.7 7.7 0 0 1 12 7.7c3.1 0 5.7 1.7 7 4.1" />
        <path d="M5 12a9.4 9.4 0 0 1 1.1-1.5" />
        <path d="M8.5 15.2A5.1 5.1 0 0 1 12 13.8c.8 0 1.5.2 2.2.5" />
        <path d="M12 19h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 7v6" />
      <path d="M12 17h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
