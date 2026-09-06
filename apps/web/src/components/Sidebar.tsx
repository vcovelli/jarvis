"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";

import {
  getStoredTheme,
  onThemeChange,
  themeModeOptions,
  themePaletteOptions,
  updateThemePreference,
  type ThemePreference,
} from "@/lib/theme";
import { useJarvisState, type StateSyncStatus } from "@/lib/jarvisStore";
import { mobileSidebarOpenEvent } from "@/lib/shellEvents";

type NavLink = {
  href: string;
  label: string;
  description: string;
  activeFor?: string[];
};

const startLinks: NavLink[] = [
  { href: "/", label: "Home", description: "Overview" },
  { href: "/daily?mode=backlog", label: "Plan", description: "Schedule", activeFor: ["/daily", "/todos"] },
  { href: "/assistant", label: "Assistant", description: "Ask" },
];

const dailyRhythmLinks: NavLink[] = [
  { href: "/must-win", label: "Must Win", description: "Priority" },
  { href: "/habits", label: "Habits", description: "Routines" },
  { href: "/mood", label: "Mood", description: "Check-in" },
  { href: "/journal", label: "Journal", description: "Reflect" },
  { href: "/sleep", label: "Sleep", description: "Recovery" },
];

const growthLinks: NavLink[] = [
  { href: "/focus", label: "Focus", description: "Deep work" },
  { href: "/objectives", label: "Objectives", description: "Goals" },
  { href: "/review", label: "Review", description: "Trends" },
  { href: "/fitness", label: "Fitness", description: "Health" },
  { href: "/career", label: "Career", description: "Growth" },
];

const resourceLinks: NavLink[] = [
  { href: "/finance", label: "Finances", description: "Money" },
  { href: "/real-estate", label: "Real Estate", description: "Property" },
  { href: "/homelab", label: "Homelab", description: "Servers" },
  { href: "/documentation", label: "Docs", description: "Reference" },
];

const adminLinks: NavLink[] = [
  { href: "/settings", label: "Settings", description: "Platform" },
  { href: "/account", label: "Account", description: "Security" },
];

const mobileLinks: NavLink[] = [
  { href: "/", label: "Home", description: "Overview" },
  { href: "/daily?mode=backlog", label: "Plan", description: "Schedule", activeFor: ["/daily", "/todos"] },
  { href: "/finance", label: "Finances", description: "Money" },
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
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
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
  const mobileAssistantClass = "mobile-nav-item mobile-nav-assistant " + (onAssistantPage ? "is-active" : "");
  const mobileAssistantContent = (
    <>
      <span className="mobile-nav-icon mobile-nav-assistant-icon">
        <AssistantNavIcon className="h-6 w-6" />
      </span>
      <span className="mobile-nav-label">Assistant</span>
    </>
  );

  const primaryMobileActive = mobileLinks.some((item) => isActive(item)) || onAssistantPage;
  const moreActive = mobileOpen || !primaryMobileActive;

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
        <button
          type="button"
          className="theme-button-secondary fixed left-3 top-[calc(env(safe-area-inset-top,0px)+1rem)] z-50 hidden items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur-2xl transition focus:outline-none lg:flex"
          aria-label="Expand sidebar"
          title="Expand sidebar"
          onClick={() => updateDesktopOpen(true)}
        >
          <SidebarExpandIcon className="h-4 w-4" />
          <span>Nav</span>
        </button>
      )}

      <aside
        className={
          "hidden w-72 shrink-0 px-4 py-6 text-sm text-zinc-400 lg:sticky lg:top-0 lg:flex lg:h-dvh " +
          (desktopOpen ? "lg:flex" : "lg:hidden")
        }
      >
        <div className="theme-surface flex w-full flex-col gap-5 rounded-[32px] p-4">
          <div className="theme-card rounded-[24px] p-4">
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
            <NavGroup title="Start">{navItems(startLinks)}</NavGroup>
            <NavGroup title="Daily rhythm">{navItems(dailyRhythmLinks)}</NavGroup>
            <NavGroup title="Growth">{navItems(growthLinks)}</NavGroup>
            <NavGroup title="Resources">{navItems(resourceLinks)}</NavGroup>
            <NavGroup title="Account">{navItems(adminLinks)}</NavGroup>
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
          className="jarvis-mobile-nav fixed inset-x-0 bottom-0 z-40 lg:hidden"
          aria-label="Primary mobile navigation"
        >
          <div className="jarvis-mobile-nav-row mx-auto grid max-w-xl grid-cols-5 gap-1">
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
              className={"mobile-nav-item " + (moreActive ? "is-active" : "")}
              aria-label="Open more navigation"
              aria-expanded={mobileOpen}
            >
              <span className="mobile-nav-icon"><MoreNavIcon className="h-4 w-4" /></span>
              <span className="mobile-nav-label">More</span>
            </button>
          </div>
        </nav>
      )}

      {mobileOpen && (
        <div data-no-pull-refresh="true" className="fixed inset-0 z-50 flex bg-slate-950/50 backdrop-blur-sm mobile-sidebar-overlay lg:hidden">
          <div
            className="mobile-sidebar theme-modal flex h-full w-80 max-w-[86vw] flex-col gap-6 rounded-r-[32px] px-6 py-8 text-sm shadow-[24px_0_80px_rgba(2,6,23,0.45)]"
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
                className="min-h-10 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70"
              >
                Close
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain">
              <NavGroup title="Start">{navItems(startLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Daily rhythm">{navItems(dailyRhythmLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Growth">{navItems(growthLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Resources">{navItems(resourceLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Account">{navItems(adminLinks, true, () => setMobileOpen(false))}</NavGroup>
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
    <Link href={href} aria-current={active ? "page" : undefined} className={"mobile-nav-item " + (active ? "is-active" : "")}>
      <span className="mobile-nav-icon"><MobileNavIcon label={item.label} className="h-4 w-4" /></span>
      <span className="mobile-nav-label">{item.label}</span>
    </Link>
  );
}

function MobileNavIcon({ label, className }: { label: string; className?: string }) {
  if (label === "Home") return <HomeNavIcon className={className} />;
  if (label === "Plan") return <PlanNavIcon className={className} />;
  if (label === "Finances") return <FinanceNavIcon className={className} />;
  return <MoreNavIcon className={className} />;
}

function HomeNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 10 9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function PlanNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M4 10h16" />
      <path d="m9 15 2 2 4-5" />
    </svg>
  );
}

function FinanceNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="m7 15 3-3 3 2 5-6" />
      <path d="M18 8h-4" />
      <path d="M18 8v4" />
    </svg>
  );
}

function MoreNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
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
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
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

  function updateTheme(patch: Partial<ThemePreference>) {
    const next = updateThemePreference(patch);
    setTheme(next);
  }

  return (
    <div className="theme-surface mt-auto rounded-[24px] p-2 text-xs">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => updateExpanded(!expanded)}
          className="theme-button-secondary flex min-w-0 flex-1 items-center gap-2 rounded-[18px] px-3 py-2 text-left transition"
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
            <div className="theme-card rounded-2xl px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Signed in</p>
              <p className="mt-1 truncate text-xs text-white/80">{sessionEmail}</p>
            </div>
          )}
          <div className="theme-card rounded-2xl p-2">
            <p className="theme-muted px-1 text-[9px] font-semibold uppercase tracking-[0.24em]">Foundation</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {themeModeOptions.map((option) => {
                const active = theme.mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.description}
                    aria-pressed={active}
                    onClick={() => updateTheme({ mode: option.value })}
                    className={"theme-chip flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.12em] transition " + (active ? "is-active" : "")}
                  >
                    <span className="h-3.5 w-7 rounded-full border border-white/25" style={{ background: option.swatch }} />
                    <span className="truncate">{option.value === "contrast" ? "High" : option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="theme-card rounded-2xl p-2">
            <p className="theme-muted px-1 text-[9px] font-semibold uppercase tracking-[0.24em]">Palette</p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {themePaletteOptions.map((option) => {
                const active = theme.palette === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.description}
                    aria-pressed={active}
                    onClick={() => updateTheme({ palette: option.value })}
                    className={"theme-chip flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] transition " + (active ? "is-active" : "")}
                  >
                    <span className="h-4 w-4 shrink-0 rounded-full border border-white/25" style={{ background: option.swatch }} />
                    <span className="truncate">{option.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshDisabled}
            className="theme-button-secondary w-full rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncStatus.remote === "refreshing" ? "Refreshing" : "Refresh state"}
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="theme-button-secondary w-full rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] transition"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
