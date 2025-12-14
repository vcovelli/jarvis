"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

const navLinks = [
  { href: "/", label: "Dashboard", description: "Overview" },
  { href: "/journal", label: "Journal", description: "Entries" },
  { href: "/todos", label: "Todos", description: "Planner" },
  { href: "/sleep", label: "Sleep", description: "Rest" },
];

export function Sidebar() {
  const pathname = usePathname();
  const activeRoot = useMemo(() => {
    if (!pathname) return "/";
    const base = pathname.split("/")[1] ?? "";
    return base ? `/${base}` : "/";
  }, [pathname]);

  return (
    <aside className="hidden min-h-screen w-64 flex-shrink-0 bg-black/30 px-6 py-10 text-sm text-zinc-400 backdrop-blur-xl lg:flex">
      <div className="flex w-full flex-col gap-8">
        <div>
          <p className="text-xs uppercase tracking-[0.5em] text-cyan-200/80">Jarvis OS</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Console</h1>
        </div>
        <nav className="flex flex-col gap-3">
          {navLinks.map((item) => {
            const isActive = activeRoot === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-2xl border px-4 py-3 transition ${
                  isActive
                    ? "border-cyan-400/60 bg-white/10 text-white"
                    : "border-white/5 bg-white/0 hover:border-white/15 hover:bg-white/5"
                }`}
              >
                <p className="text-base font-semibold">{item.label}</p>
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-400">
                  {item.description}
                </p>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/5 bg-white/5 p-4 text-xs text-zinc-300">
          Future: Chat agent will live here with confirmation queue.
        </div>
      </div>
    </aside>
  );
}
