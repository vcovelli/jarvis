"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

const navLinks = [
  { href: "/", label: "Dashboard", description: "Overview" },
  { href: "/journal", label: "Journal", description: "Entries" },
  { href: "/todos", label: "Todos", description: "Planner" },
  { href: "/sleep", label: "Sleep", description: "Rest" },
];

type SidebarProps = {
  basePath?: string;
};

export function Sidebar({ basePath = "/" }: SidebarProps) {
  const pathname = usePathname();
  const normalizedBase =
    !basePath || basePath === "/" ? "" : basePath.replace(/\/$/, "");
  const activePath =
    pathname && normalizedBase && pathname.startsWith(normalizedBase)
      ? pathname.slice(normalizedBase.length) || "/"
      : pathname ?? "/";
  const activeRoot = useMemo(() => {
    const base = activePath.split("/")[1] ?? "";
    return base ? `/${base}` : "/";
  }, [activePath]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  const navItems = (dense = false, onNavigate?: () => void) =>
    navLinks.map((item) => {
      const href =
        item.href === "/" ? normalizedBase || "/" : `${normalizedBase}${item.href}`;
      const isActive = activeRoot === item.href;
      return (
        <Link
          key={item.href}
          href={href}
          onClick={() => {
            if (onNavigate) onNavigate();
          }}
          className={`rounded-2xl border px-4 py-3 transition ${
            isActive
              ? "border-cyan-400/60 bg-white/10 text-white"
              : "border-white/5 bg-white/0 hover:border-white/15 hover:bg-white/5"
          } ${dense ? "text-sm" : ""}`}
        >
          <p className={`font-semibold ${dense ? "text-sm" : "text-base"}`}>{item.label}</p>
          {!dense && (
            <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">
              {item.description}
            </p>
          )}
        </Link>
      );
    });

  return (
    <>
      <button
        type="button"
        className="fixed left-4 z-40 rounded-full bg-black/60 p-3 text-white shadow-lg lg:hidden"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen(true)}
      >
        ☰
      </button>
      {!desktopOpen && (
        <button
          type="button"
          className="fixed left-4 z-30 hidden rounded-full bg-black/60 p-3 text-white shadow-lg lg:block"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 1rem)" }}
          aria-label="Expand sidebar"
          onClick={() => setDesktopOpen(true)}
        >
          ☰
        </button>
      )}
      <aside
        className={`hidden w-64 flex-shrink-0 bg-black/30 px-4 py-8 text-sm text-zinc-400 backdrop-blur-xl lg:sticky lg:top-0 ${
          desktopOpen ? "lg:flex" : "lg:hidden"
        } lg:h-dvh`}
      >
        <div className="flex w-full flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-cyan-200/80">Jarvis OS</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">Console</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDesktopOpen(false)}
                className="hidden rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-[0.3em] text-white/60 hover:text-white lg:inline-flex"
              >
                Hide
              </button>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {navItems()}
          </nav>
          <div className="mt-auto rounded-2xl border border-white/5 bg-white/5 p-4 text-xs text-zinc-300">
            Future: Chat agent will live here with confirmation queue.
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex h-full w-72 flex-col gap-6 bg-[#050b18] px-6 py-8 text-sm text-zinc-200 shadow-2xl"
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
            <nav className="flex flex-1 flex-col gap-3 overflow-y-auto">{navItems(true, () => setMobileOpen(false))}</nav>
          </div>
          <button
            type="button"
            className="h-full flex-1 bg-black/60"
            onClick={() => setMobileOpen(false)}
          >
            <span className="sr-only">Close menu</span>
          </button>
        </div>
      )}
    </>
  );
}
