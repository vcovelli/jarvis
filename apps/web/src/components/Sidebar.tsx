"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";

import { applyTheme, getStoredTheme, onThemeChange, type ThemeMode } from "@/lib/theme";
import { useJarvisState, type StateSyncStatus } from "@/lib/jarvisStore";

type NavLink = {
  href: string;
  label: string;
  description: string;
  activeFor?: string[];
};

const coreLinks: NavLink[] = [
  { href: "/", label: "Home", description: "State" },
  { href: "/daily", label: "Daily", description: "Planner", activeFor: ["/daily", "/todos"] },
  { href: "/journal", label: "Journal", description: "Notes" },
  { href: "/sleep", label: "Sleep", description: "Recovery" },
  { href: "/objectives", label: "Objectives", description: "Outcomes" },
];

const systemLinks: NavLink[] = [
  { href: "/homelab", label: "Homelab", description: "Server" },
  { href: "/services", label: "Services", description: "Catalog" },
  { href: "/documentation", label: "Docs", description: "Markdown" },
  { href: "/review", label: "Review", description: "Trends" },
];

const growthLinks: NavLink[] = [
  { href: "/focus", label: "Focus", description: "Discipline" },
  { href: "/career", label: "Career", description: "Skills" },
  { href: "/manufacturing", label: "Manufacturing", description: "CNC" },
  { href: "/finance", label: "Finance", description: "Goals" },
  { href: "/fitness", label: "Fitness", description: "Health" },
];

const utilityLinks: NavLink[] = [
  { href: "/assistant", label: "Assistant", description: "Future agent" },
  { href: "/settings", label: "Settings", description: "Platform" },
  { href: "/account", label: "Account", description: "Security" },
];

const mobileLinks: NavLink[] = [
  { href: "/", label: "Home", description: "State" },
  { href: "/daily", label: "Daily", description: "Planner", activeFor: ["/daily", "/todos"] },
  { href: "/finance", label: "Finances", description: "Goals" },
];

type SidebarProps = {
  basePath?: string;
};

export function Sidebar({ basePath = "/" }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { syncStatus } = useJarvisState();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  useEffect(() => {
    return onThemeChange(setTheme);
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
    const pathOnly = item.href.split("?")[0] || "/";
    return item.activeFor?.includes(activeRoot) ?? activeRoot === pathOnly;
  }

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
          className="fixed left-4 z-30 hidden rounded-full border border-white/10 bg-white/10 p-3 text-sm font-semibold text-white shadow-lg backdrop-blur-xl lg:block"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
          aria-label="Expand sidebar"
          onClick={() => setDesktopOpen(true)}
        >
          Menu
        </button>
      )}

      <aside
        className={
          "hidden w-72 shrink-0 px-4 py-6 text-sm text-zinc-400 lg:sticky lg:top-0 lg:flex lg:h-dvh " +
          (desktopOpen ? "lg:flex" : "lg:hidden")
        }
      >
        <div className="flex w-full flex-col gap-5 rounded-[32px] border border-white/10 bg-white/[0.05] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.25)] backdrop-blur-2xl">
          <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-cyan-400/12 via-white/6 to-indigo-400/10 p-4">
            <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/80">Jarvis OS</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Console</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Smooth daily planning, reflection, and review from anywhere.</p>
          </div>

          <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <NavGroup title="Core">{navItems(coreLinks)}</NavGroup>
            <NavGroup title="Systems">{navItems(systemLinks)}</NavGroup>
            <NavGroup title="Growth">{navItems(growthLinks)}</NavGroup>
            <NavGroup title="Tools">{navItems(utilityLinks)}</NavGroup>
          </nav>

          <ShellControls sessionEmail={session?.user?.email} theme={theme} setTheme={setTheme} syncStatus={syncStatus} />
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/88 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.45rem)] pt-2 shadow-[0_-18px_50px_rgba(2,6,23,0.4)] backdrop-blur-2xl lg:hidden"
        aria-label="Primary mobile navigation"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 items-end gap-1">
          <MobileBarLink item={mobileLinks[0]} active={isActive(mobileLinks[0])} href={buildHref(mobileLinks[0].href)} />
          <MobileBarLink item={mobileLinks[1]} active={isActive(mobileLinks[1])} href={buildHref(mobileLinks[1].href)} />
          <Link
            href={buildHref("/assistant?voice=1")}
            aria-label="Start voice action"
            className="flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 pb-1 text-center text-[10px] font-semibold text-cyan-100 transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/60 bg-cyan-300 text-slate-950 shadow-[0_12px_30px_rgba(34,211,238,0.32)]">
              <MicrophoneIcon className="h-6 w-6" />
            </span>
            <span className="truncate">Voice</span>
          </Link>
          <MobileBarLink item={mobileLinks[2]} active={isActive(mobileLinks[2])} href={buildHref(mobileLinks[2].href)} />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center text-[10px] font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            aria-label="Open more navigation"
            aria-expanded={mobileOpen}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base leading-none">...</span>
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex mobile-sidebar-overlay lg:hidden">
          <div
            className="mobile-sidebar flex h-full w-80 max-w-[86vw] flex-col gap-6 bg-slate-950/95 px-6 py-8 text-sm text-zinc-200 shadow-2xl backdrop-blur-2xl"
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
            <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
              <NavGroup title="Core">{navItems(coreLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Systems">{navItems(systemLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Growth">{navItems(growthLinks, true, () => setMobileOpen(false))}</NavGroup>
              <NavGroup title="Tools">{navItems(utilityLinks, true, () => setMobileOpen(false))}</NavGroup>
            </nav>
            <ShellControls sessionEmail={session?.user?.email} theme={theme} setTheme={setTheme} syncStatus={syncStatus} />
          </div>
          <button type="button" className="h-full flex-1 bg-black/60" onClick={() => setMobileOpen(false)}>
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
        "flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center text-[10px] font-semibold transition " +
        (active ? "bg-cyan-300 text-zinc-950 shadow-lg" : "text-zinc-300 hover:bg-white/5 hover:text-white")
      }
    >
      <span className={"flex h-7 w-7 items-center justify-center rounded-full border text-[12px] font-bold " + (active ? "border-zinc-950/10 bg-zinc-950/10" : "border-white/10 bg-white/5")}>
        {item.label.charAt(0)}
      </span>
      <span className="w-full truncate">{item.label}</span>
    </Link>
  );
}

function MicrophoneIcon({ className }: { className?: string }) {
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
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
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
}: {
  sessionEmail?: string | null;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  syncStatus: StateSyncStatus;
}) {
  return (
    <div className="mt-auto space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-4 text-xs text-zinc-300">
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
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-full rounded-full border border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 transition hover:border-white/20 hover:text-white"
      >
        Sign out
      </button>
    </div>
  );
}
