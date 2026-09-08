"use client";

import { useLayoutEffect, useRef, type TouchEvent } from "react";

export type MobileSectionOption<T extends string> = {
  value: T;
  label: string;
  badge?: string | number;
};

type MobileSectionNavProps<T extends string> = {
  label: string;
  value: T;
  options: MobileSectionOption<T>[];
  onChange: (value: T) => void;
};

/**
 * A compact mobile-only view switcher. Pages keep one data/controller layer and
 * choose a focused presentation instead of mounting a second mobile app.
 */
export function MobileSectionNav<T extends string>({
  label,
  value,
  options,
  onChange,
}: MobileSectionNavProps<T>) {
  const navRef = useRef<HTMLElement>(null);
  const previousValueRef = useRef(value);
  const touchRef = useRef<{ id: number; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (previousValueRef.current === value) return;
    previousValueRef.current = value;

    const nav = navRef.current;
    const viewport = nav?.closest<HTMLElement>(".jarvis-page-viewport");
    if (!nav || !viewport || !nav.getClientRects().length) return;

    // Measure the menu's normal position, not its pinned position after a long
    // section has scrolled. Do this after the new section mounts, before paint.
    const inset = parseFloat(getComputedStyle(nav).top) || 0;
    const position = nav.style.position;
    nav.style.position = "static";
    const top = viewport.scrollTop + nav.getBoundingClientRect().top - viewport.getBoundingClientRect().top - inset;
    nav.style.position = position;
    viewport.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, [value]);

  function startTouch(event: TouchEvent<HTMLButtonElement>) {
    const touch = event.touches[0];
    touchRef.current = event.touches.length === 1
      ? { id: touch.identifier, x: touch.clientX, y: touch.clientY }
      : null;
  }

  function moveTouch(event: TouchEvent<HTMLButtonElement>) {
    const start = touchRef.current;
    const touch = Array.from(event.touches).find((item) => item.identifier === start?.id);
    if (!start || !touch || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) {
      touchRef.current = null;
    }
  }

  function endTouch(event: TouchEvent<HTMLButtonElement>, nextValue: T) {
    const start = touchRef.current;
    touchRef.current = null;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === start?.id);
    if (!start || !touch || event.touches.length || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) return;

    // Activate on release without waiting for an emulated mouse/hover sequence.
    // Cancel its synthetic click so the same tap cannot run onChange twice.
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    onChange(nextValue);
  }

  return (
    <nav
      ref={navRef}
      data-guide="section-navigation"
      className="mobile-section-nav lg:hidden"
      aria-label={label}
      data-no-pull-refresh="true"
    >
      <div className="mobile-section-nav-scroll hide-scrollbar">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              data-guide-section={option.value}
              type="button"
              className={"mobile-section-nav-item " + (active ? "is-active" : "")}
              aria-current={active ? "page" : undefined}
              onTouchStart={startTouch}
              onTouchMove={moveTouch}
              onTouchEnd={(event) => endTouch(event, option.value)}
              onTouchCancel={() => { touchRef.current = null; }}
              onPointerCancel={() => { touchRef.current = null; }}
              onClick={() => onChange(option.value)}
            >
              <span>{option.label}</span>
              {option.badge !== undefined ? (
                <span className="mobile-section-nav-badge">{option.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

