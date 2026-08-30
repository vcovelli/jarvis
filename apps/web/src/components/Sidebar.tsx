"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";

import { applyTheme, getStoredTheme, onThemeChange, type ThemeMode } from "@/lib/theme";
import { useJarvisState, type StateSyncStatus } from "@/lib/jarvisStore";
import { mobileSidebarOpenEvent } from "@/lib/shellEvents";

type NavLink = {
  href: string;
  label: string;
  description: string;
  activeFor?: string[];
};

const commandLinks: NavLink[] = [
  { href: "/", label: "Home", description: "State" },
  { href: "/finance", label: "Finances", description: "Money" },
  { href: "/assistant", label: "Assistant", description: "Agent" },
  { href: "/daily", label: "Daily", description: "Planner", activeFor: ["/daily", "/todos"] },
  { href: "/habits", label: "Habits", description: "Chains" },
  { href: "/sleep", label: "Sleep", description: "Recovery" },
  { href: "/?focus=mood", label: "Mood", description: "Check-in" },
  { href: "/homelab", label: "Homelab", description: "Server" },
];

const planningLinks: NavLink[] = [
  { href: "/journal", label: "Journal", description: "Notes" },
  { href: "/focus", label: "Focus", description: "Discipline" },
  { href: "/objectives", label: "Objectives", description: "Outcomes" },
  { href: "/review", label: "Review", description: "Trends" },
];

const systemLinks: NavLink[] = [
  { href: "/documentation", label: "Docs", description: "Markdown" },
  { href: "/career", label: "Career", description: "Skills" },
  { href: "/manufacturing", label: "Manufacturing", description: "CNC" },
  { href: "/real-estate", label: "Real Estate", description: "Deals" },
  { href: "/fitness", label: "Fitness", description: "Health" },
];

const adminLinks: NavLink[] = [
  { href: "/settings", label: "Settings", description: "Platform" },
  { href: "/account", label: "Account", description: "Security" },
];

const mobileLinks: NavLink[] = [
  { href: "/", label: "Home", description: "State" },
  { href: "/daily", label: "Daily", description: "Planner", activeFor: ["/daily", "/todos"] },
  { href: "/finance", label: "Finances", description: "Goals" },
];

const desktopSidebarStorageKey = "jarvis-desktop-sidebar-open";
const shellControlsStorageKey = "jarvis-shell-controls-expanded";

function getStoredDesktopSidebarOpen() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(desktopSidebarStorageKey) !== "false";
  } catch {
    return true;
  }
}

function getStoredShellControlsExpanded() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(shellControlsStorageKey) === "true";
  } catch {
    return false;
  }
}

type SidebarProps = {
  basePath?: string;
};

export function Sidebar({ basePath = "/" }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { syncStatus, refreshRemoteState } = useJarvisState();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(() => getStoredDesktopSidebarOpen());

  useEffect(() => {
    return onThemeChange(setTheme);
  }, []);

  function updateDesktopOpen(next: boolean) {
    setDesktopOpen(next);
    try {
      window.localStorage.setItem(desktopSidebarStorageKey, String(next));
    } catch {
      // Keep the current session usable even if browser storage is blocked.
    }
  }

  useEffect(() => {
    function openMobileSidebar() {
      setMobileOpen(true);
    }

    window.addEventListener(mobileSidebarOpenEvent, openMobileSidebar);
    return () => {
      window.removeEventListener(mobileSidebarOpenEvent, openMobileSidebar);
    };
  }, []);

  const normalizedBase =
    !basePath || basePath === "/" ? "" : basePath.replace(/\/$/, "");
  const activePath =
    pathname && normalizedBase && pathname.startsWith(normalizedBase)
      ? pathname.slice(normalizedBase.length) || "/"
      : pathname ?? "/";
  const activeRootBase = activePath.split("/")[1] ?? "";
  const activeRoot = activeRootBase ? "/" + activeRootBase : "/";

  function buildHref(href: string) {
    const [path, query] = href.split("?");
    const resolvedPath = path === "/" ? normalizedBase || "/" : normalizedBase + path;
    return query ? resolvedPath + "?" + query : resolvedPath;
  }

  function isActive(item: NavLink) {
    const [pathOnly = "/", query = ""] = item.href.split("?");
    const focusTarget = new URLSearchParams(query).get("focus");
    const activeFocus = searchParams?.get("focus") ?? null;

    if (focusTarget) {
      return activeRoot === (pathOnly || "/") && activeFocus === focusTarget;
    }
    if ((pathOnly || "/") === "/" && activeRoot === "/" && activeFocus) {
      return false;
    }
    return item.activeFor?.includes(activeRoot) ?? activeRoot === (pathOnly || "/");
  }

  const onAssistantPage = activeRoot === "/assistant";
  const habitsImmersive = activeRoot === "/habits";
  const mobileAssistantClass =
    "flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 pb-1 text-center text-[10px] font-semibold transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cyan-200/70 " +
    (onAssistantPage ? "text-cyan-50" : "text-cyan-100");
  const mobileAssistantContent = (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/60 bg-cyan-300 text-slate-950 shadow-[0_12px_30px_rgba(34,211,238,0.32)]">
        <AssistantNavIcon className="h-7 w-7" />
      </span>
      <span className="truncate">Assistant</span>
    </>
  );

  const navItems = (items: NavLink[], dense = false, onNavigate?: () => void) =>
    items.map((item) => {
      const active = isActive(item);
      const linkClass =
        "group rounded-[20px] border px-4 py-3 transition-all duration-200 " +
        (active
          ? "border-cyan-400/50 bg-cyan-400/12 text-white shadow-[0_10px_30px_rgba(34,211,238,0.16)]"
          : "border-white/10 bg-white/0 text-zinc-300 hover:border-white/20 hover:bg-white/8 hover:text-white") +
        (dense ? " text-sm" : "");
      return (
        <Link
          key={item.href + "-" + item.label}
          href={buildHref(item.href)}
          onClick={() => onNavigate?.()}
          className={linkClass}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={"font-semibold " + (dense ? "text-sm" : "text-[15px]")}>{item.label}</p>
              {!dense && <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-zinc-400">{item.description}</p>}
            </div>
            <span className={"inline-flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold " + (active ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-zinc-400 group-hover:border-white/20 group-hover:text-white") }>
              {item.label.charAt(0)}
            </span>
          </div>
        </Link>
      );
    });

  return (
    <>
      {!desktopOpen && (
        <div
          className="group fixed inset-y-0 left-0 z-30 hidden w-12 lg:block"
          aria-label="Collapsed sidebar reveal zone"
        >
          <button
            type="button"
            className="absolute left-3 top-1/2 flex -translate-x-[calc(100%+1rem)] -translate-y-1/2 items-center gap-2 rounded-full border border-cyan-200/20 bg-[#08111f]/90 px-3 py-2 text-sm font-semibold text-cyan-50 opacity-0 shadow-[0_16px_48px_rgba(2,6,23,0.32)] backdrop-blur-2xl transition-all duration-200 ease-out hover:border-cyan-200/45 hover:bg-cyan-300/10 focus:translate-x-0 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-cyan-200/70 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            onClick={() => updateDesktopOpen(true)}
          >
            <SidebarExpandIcon className="h-4 w-4" />
            <span>Nav</span>
          </button>
        </div>
      )}

      <aside
        className={
          "hidden w-72 shrink-0 px-4 py-6 text-sm text-zinc-400 lg:sticky lg:top-0 lg:flex lg:h-dvh " +
          (desktopOpen ? "lg:flex" : "lg:hidden")
        }
      >
        <div className="flex w-full flex-col gap-5 rounded-[32px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.25)] backdrop-blur-2xl">
          <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-cyan-400/12 via-white/6 to-indigo-400/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/80">Jarvis OS</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Console</h1>
              </div>
              <button
                type="button"
                onClick={() => updateDesktopOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:border-cyan-200/35 hover:bg-cyan-300/10 hover:text-cyan-50"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <SidebarCollapseIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Smooth daily planning, reflection, and review from anywhere.</p>
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
            <NavGroup title="Command">{navItems(commandLinks)}</NavGroup>
            <NavGroup title="Plan">{navItems(planningLinks)}</NavGroup>
            <NavGroup title="Systems">{navItems(systemLinks)}</NavGroup>
            <NavGroup title="Admin">{navItems(adminLinks)}</NavGroup>
          </nav>

          <ShellControls
            sessionEmail={session?.user?.email}
            theme={theme}
            setTheme={setTheme}
            syncStatus={syncStatus}
            onRefresh={refreshRemoteState}
          />
        </div>
      </aside>

      {!habitsImmersive && (
        <nav
          data-no-pull-refresh="true"
          className="jarvis-mobile-nav fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/90 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-18px_45px_rgba(2,6,23,0.38)] backdrop-blur-2xl lg:hidden"
          aria-label="Primary mobile navigation"
        >
          <div className="mx-auto grid h-[4.45rem] max-w-xl grid-cols-5 items-end gap-1">
            <MobileBarLink item={mobileLinks[0]} active={isActive(mobileLinks[0])} href={buildHref(mobileLinks[0].href)} />
            <MobileBarLink item={mobileLinks[1]} active={isActive(mobileLinks[1])} href={buildHref(mobileLinks[1].href)} />
            <Link
              href={buildHref("/assistant")}
              aria-label="Open assistant"
              aria-current={onAssistantPage ? "page" : undefined}
              className={mobileAssistantClass}
            >
              {mobileAssistantContent}
            </Link>
            <MobileBarLink item={mobileLinks[2]} active={isActive(mobileLinks[2])} href={buildHref(mobileLinks[2].href)} />
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-1 py-2 text-center text-[10px] font-semibold text-zinc-300 transition hover:bg-white/6 hover:text-white active:scale-[0.98]"
              aria-label="Open more navigation"
              aria-expanded={mobileOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base leading-none">...</span>
              <span className="truncate">More</span>
            </button>
          </div>
        </nav>
      )}

      {mobileOpen && (
        <div data-no-pull-refresh="true" className="fixed inset-0 z-50 flex bg-slate-950/50 backdrop-blur-sm mobile-sidebar-overlay lg:hidden">
          <div
            className="mobile-sidebar flex h-full w-80 max-w-[86vw] flex-col gap-6 rounded-r-[32px] border-r border-white/10 bg-slate-950/92 px-6 py-8 text-sm text-zinc-200 shadow-[24px_0_80px_rgba(2,6,23,0.45)] backdrop-blur-2xl"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.5em] text-cyan-200/80">Jarvis OS</p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/70"
              >
                Close
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain">
              <NavGroup title="Command">{navItems(commandLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Plan">{navItems(planningLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Systems">{navItems(systemLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Admin">{navItems(adminLinks, true, () => setMobileOpen(false))}</NavGroup>
            </nav>
            <ShellControls
              sessionEmail={session?.user?.email}
              theme={theme}
              setTheme={setTheme}
              syncStatus={syncStatus}
              onRefresh={refreshRemoteState}
            />
          </div>
          <button type="button" className="h-full flex-1" onClick={() => setMobileOpen(false)}>
            <span className="sr-only">Close menu</span>
          </button>
        </div>
      )}
    </>
  );
}

function MobileBarLink({ item, active, href }: { item: NavLink; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={
        "flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-1 py-2 text-center text-[10px] font-semibold transition active:scale-[0.98] " +
        (active ? "bg-cyan-300 text-zinc-950 shadow-[0_10px_24px_rgba(34,211,238,0.24)]" : "text-zinc-300 hover:bg-white/6 hover:text-white")
      }
    >
      <span className={"flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-bold " + (active ? "border-zinc-950/10 bg-zinc-950/10" : "border-white/10 bg-white/5")}>
        {item.label.charAt(0)}
      </span>
      <span className="w-full truncate">{item.label}</span>
    </Link>
  );
}

function AssistantNavIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v3" />
      <rect x="5" y="7" width="14" height="11" rx="4" />
      <path d="M8.5 12h.01" />
      <path d="M15.5 12h.01" />
      <path d="M9.5 15h5" />
      <path d="M5 12H3" />
      <path d="M21 12h-2" />
    </svg>
  );
}

function SidebarCollapseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 4v16" />
      <path d="m15 9-3 3 3 3" />
    </svg>
  );
}

function SidebarExpandIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 4v16" />
      <path d="m12 9 3 3-3 3" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-[11px] uppercase tracking-[0.35em] text-zinc-500">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function StateSaveStatus({ syncStatus }: { syncStatus: StateSyncStatus }) {
  const { label, detail, toneClass } = getSaveStatusDisplay(syncStatus);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Save status</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${toneClass}`} />
        <p className="text-xs font-semibold text-white/85">{label}</p>
      </div>
      {detail && <p className="mt-1 text-[11px] text-zinc-500">{detail}</p>}
    </div>
  );
}

function getSaveStatusDisplay(syncStatus: StateSyncStatus) {
  const savedAt = syncStatus.lastRemoteSavedAt ?? syncStatus.lastLocalSavedAt;
  const lastSaved = savedAt ? `Last saved ${formatShellTime(savedAt)}` : undefined;

  if (syncStatus.local === "loading") {
    return { label: "Loading", detail: "Preparing storage", toneClass: "bg-zinc-400" };
  }
  if (syncStatus.local === "error") {
    return { label: "Save issue", detail: syncStatus.error, toneClass: "bg-red-400" };
  }
  if (syncStatus.remote === "saving") {
    return { label: "Saving", detail: lastSaved, toneClass: "bg-cyan-300 animate-pulse" };
  }
  if (syncStatus.remote === "refreshing") {
    return { label: "Refreshing", detail: lastSaved, toneClass: "bg-cyan-300 animate-pulse" };
  }
  if (syncStatus.remote === "pending") {
    return { label: "Saving soon", detail: lastSaved, toneClass: "bg-amber-300" };
  }
  if (syncStatus.remote === "offline" || syncStatus.remote === "error") {
    return {
      label: "Saved locally",
      detail: syncStatus.remote === "error" ? "Server sync will retry" : lastSaved,
      toneClass: "bg-amber-300",
    };
  }
  if (syncStatus.remote === "saved") {
    return { label: "Synced", detail: lastSaved, toneClass: "bg-emerald-300" };
  }
  return { label: "Saved locally", detail: lastSaved, toneClass: "bg-emerald-300" };
}

function formatShellTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ShellControls({
  sessionEmail,
  theme,
  setTheme,
  syncStatus,
  onRefresh,
}: {
  sessionEmail?: string | null;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  syncStatus: StateSyncStatus;
  onRefresh: () => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(() => getStoredShellControlsExpanded());
  const status = getSaveStatusDisplay(syncStatus);
  const refreshDisabled =
    syncStatus.local === "loading" ||
    syncStatus.remote === "saving" ||
    syncStatus.remote === "refreshing";

  function updateExpanded(next: boolean) {
    setExpanded(next);
    try {
      window.localStorage.setItem(shellControlsStorageKey, String(next));
    } catch {
      // Keep the current session usable even if browser storage is blocked.
    }
  }

  return (
    <div className="mt-auto rounded-[24px] border border-white/10 bg-white/5 p-2 text-xs text-zinc-300">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => updateExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[18px] border border-white/10 bg-black/25 px-3 py-2 text-left transition hover:border-cyan-200/30 hover:bg-white/[0.06]"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse shell controls" : "Expand shell controls"}
        >
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.toneClass}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white/85">{status.label}</span>
            {status.detail && <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{status.detail}</span>}
          </span>
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-white/45 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshDisabled}
          className="grid h-auto w-11 shrink-0 place-items-center rounded-[18px] border border-cyan-200/25 bg-cyan-300/10 text-cyan-100 transition hover:border-cyan-200/55 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Refresh state"
          title={syncStatus.remote === "refreshing" ? "Refreshing state" : "Refresh state"}
        >
          <RefreshIcon className={`h-4 w-4 ${syncStatus.remote === "refreshing" ? "animate-spin" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <StateSaveStatus syncStatus={syncStatus} />
          {sessionEmail && (
            <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Signed in</p>
              <p className="mt-1 truncate text-xs text-white/80">{sessionEmail}</p>
            </div>
          )}
          <div className="inline-flex w-full rounded-full border border-white/10 bg-white/5 p-1 text-[10px] uppercase tracking-[0.3em]">
            {(["dark", "light"] as const).map((option) => {
              const active = theme === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setTheme(option);
                    applyTheme(option);
                  }}
                  className={
                    "flex-1 rounded-full px-3 py-2 font-semibold transition " +
                    (active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-300 hover:text-white")
                  }
                >
                  {option}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshDisabled}
            className="w-full rounded-full border border-cyan-200/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-200/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncStatus.remote === "refreshing" ? "Refreshing" : "Refresh state"}
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
