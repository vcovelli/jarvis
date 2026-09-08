"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

import { PullToRefresh } from "@/components/PullToRefresh";

export function PageViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewportRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const workspace = pathname.split("/")[2] ?? "home";
  const previousRouteRef = useRef(`${pathname}?${searchParams.toString()}`);

  useLayoutEffect(() => {
    const route = `${pathname}?${searchParams.toString()}`;
    if (route === previousRouteRef.current) return;

    previousRouteRef.current = route;
    const viewport = viewportRef.current;
    if (!viewport || (viewport.scrollTop === 0 && viewport.scrollLeft === 0)) return;

    viewport.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, searchParams]);

  return (
    <main
      ref={viewportRef}
      data-workspace={workspace}
      className="jarvis-page-viewport flex min-h-0 min-w-0 w-full max-w-none flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain"
    >
      <PullToRefresh viewportRef={viewportRef} contentRef={contentRef} />
      <div ref={contentRef} className="jarvis-pull-content flex min-w-0 flex-col">
        {children}
      </div>
    </main>
  );
}
