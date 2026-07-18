"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";

import { applyTheme, getStoredTheme, onThemeChange, type ThemeMode } from "@/lib/theme";

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
  { href: "/daily", label: "Add", description: "Task", activeFor: ["/daily", "/todos"] },
  { href: "/?focus=timeline", label: "Timeline", description: "Recent" },
];

type SidebarProps = {
  basePath?: string;
};

export function Sidebar({ basePath = "/" }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
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

          <ShellControls sessionEmail={session?.user?.email} theme={theme} setTheme={setTheme} />
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/80 px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-2 backdrop-blur-2xl lg:hidden"
        aria-label="Primary mobile navigation"
      >
        <div className="grid grid-cols-5 gap-1">
          {mobileLinks.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href + "-" + item.label}
                href={buildHref(item.href)}
                className={
                  "rounded-2xl px-2 py-2 text-center text-[11px] font-semibold transition " +
                  (active ? "bg-cyan-300 text-zinc-950 shadow-lg" : "text-zinc-300")
                }
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-2xl px-2 py-2 text-center text-[11px] font-semibold text-zinc-300"
            aria-label="Open more navigation"
            aria-expanded={mobileOpen}
          >
            More
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
            <ShellControls sessionEmail={session?.user?.email} theme={theme} setTheme={setTheme} />
          </div>
          <button type="button" className="h-full flex-1 bg-black/60" onClick={() => setMobileOpen(false)}>
            <span className="sr-only">Close menu</span>
          </button>
        </div>
      )}
    </>
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

function ShellControls({
  sessionEmail,
  theme,
  setTheme,
}: {
  sessionEmail?: string | null;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}) {
  return (
    <div className="mt-auto space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-4 text-xs text-zinc-300">
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
