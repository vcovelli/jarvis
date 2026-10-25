"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Children, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
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
import { WalkthroughCoach } from "./onboarding/WalkthroughCoach";
import { useOptionalWalkthrough } from "./onboarding/WalkthroughProvider";
import { findGuide, matchesGuideRoute } from "@/lib/userGuides";
import { useMobileLayout } from "@/lib/useMobileLayout";
import { mobileSidebarOpenEvent } from "@/lib/shellEvents";
import styles from "./Sidebar.module.css";

type NavLink = {
  href: string;
  label: string;
  description: string;
  activeFor?: string[];
};

const startLinks: NavLink[] = [
  { href: "/", label: "Home", description: "Overview" },
  { href: "/daily?mode=backlog", label: "Plan", description: "Schedule", activeFor: ["/daily", "/todos"] },
  { href: "/operations", label: "Operations", description: "System, power, GPU, decisions" },
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
  { href: "/objectives", label: "Objectives", description: "Goals" },
  { href: "/review", label: "Review", description: "Trends" },
];

const resourceLinks: NavLink[] = [
  { href: "/finance", label: "Finances", description: "Money" },
  { href: "/real-estate", label: "Real Estate", description: "Property" },
  { href: "/homelab", label: "Homelab", description: "Servers" },
  { href: "/documentation", label: "Docs", description: "Reference" },
];

const adminLinks: NavLink[] = [
  { href: "/guide", label: "User guide", description: "Learn" },
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

const subscribeToHydration = () => () => {};

function useHydrated() {
  return useSyncExternalStore(subscribeToHydration, () => true, () => false);
}

type SidebarProps = {
  canAdmin?: boolean;
  basePath?: string;
};

export function Sidebar({ basePath = "/", canAdmin = false }: SidebarProps) {
  const accountLinks = canAdmin ? [...adminLinks, { href: "/admin", label: "Admin", description: "Control" }] : adminLinks;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { syncStatus, refreshRemoteState } = useJarvisState();
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navQuery, setNavQuery] = useState("");
  const hydrated = useHydrated();
  const [desktopPreference, setDesktopOpen] = useState(() => getStoredDesktopSidebarOpen());
  const walkthrough = useOptionalWalkthrough();
  const guideStep = walkthrough?.active ? findGuide(walkthrough.active.id)?.steps[walkthrough.active.step] : undefined;
  const guideOnRoute = Boolean(guideStep && matchesGuideRoute(pathname, guideStep.route));
  const guidedShell = Boolean(guideStep?.shell && guideOnRoute);
  const guidedTheme = guideStep?.shell === "theme" && guideOnRoute;
  const mobile = useMobileLayout();
  const mobileVisible = mobile && (mobileOpen || guidedShell);
  const desktopOpen = guidedShell || (hydrated ? desktopPreference : true);
  const [shellExpandedPreference, setShellExpanded] = useState(getStoredShellControlsExpanded);
  const shellExpanded = hydrated && shellExpandedPreference;
  const guidedShellStep = guidedShell ? guideStep!.id : null;
  const previousGuidedShellStep = useRef<string | null>(null);
  const updateShellExpanded = useCallback((next: boolean) => {
    setShellExpanded(next);
    try { window.localStorage.setItem(shellControlsStorageKey, String(next)); } catch { /* Keep controls usable. */ }
  }, []);

  useEffect(() => {
    if (previousGuidedShellStep.current === guidedShellStep) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      previousGuidedShellStep.current = guidedShellStep;
      updateShellExpanded(guidedTheme);
    });
    return () => { cancelled = true; };
  }, [guidedShellStep, guidedTheme, updateShellExpanded]);

  function closeMobileSidebar() {
    setMobileOpen(false);
    setNavQuery("");
    if (guidedTheme) walkthrough?.skip();
  }
  const [mobileNavigation, setMobileNavigation] = useState<{ href: string; fromRoute: string } | null>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!mobileVisible) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = mobileDrawerRef.current;
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    function closeOnDesktop() {
      if (desktopQuery.matches) setMobileOpen(false);
    }
    desktopQuery.addEventListener("change", closeOnDesktop);
    document.body.classList.add("scroll-locked");
    const focusFrame = window.requestAnimationFrame(() => {
      drawer?.querySelector<HTMLElement>("button, a[href], input, select, textarea")?.focus();
    });

    function handleDrawerKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        drawer?.querySelector<HTMLButtonElement>("[data-sidebar-close]")?.click();
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)"),
      ).filter((element) => element.getClientRects().length > 0 && !element.closest('[hidden], [aria-hidden="true"]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === drawer)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleDrawerKeydown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleDrawerKeydown);
      desktopQuery.removeEventListener("change", closeOnDesktop);
      document.body.classList.remove("scroll-locked");
      previousFocus?.focus();
    };
  }, [mobileVisible]);

  const normalizedBase =
    !basePath || basePath === "/" ? "" : basePath.replace(/\/$/, "");
  const activePath =
    pathname && normalizedBase && pathname.startsWith(normalizedBase)
      ? pathname.slice(normalizedBase.length) || "/"
      : pathname ?? "/";
  const activeRootBase = activePath.split("/")[1] ?? "";
  const activeRoot = activeRootBase ? "/" + activeRootBase : "/";
  const currentSearch = searchParams?.toString() ?? "";
  const currentHref = `${pathname ?? ""}${currentSearch ? `?${currentSearch}` : ""}`;
  const currentRoute = `${pathname ?? ""}?${currentSearch}`;
  const pendingMobileHref = mobileNavigation?.fromRoute === currentRoute ? mobileNavigation.href : null;

  useEffect(() => {
    if (!pendingMobileHref) return;
    const timeout = window.setTimeout(() => setMobileNavigation(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [pendingMobileHref]);

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

  function isMobileActive(item: NavLink) {
    if (pendingMobileHref) return pendingMobileHref === buildHref(item.href);
    return isActive(item);
  }

  function beginMobileNavigation(href: string) {
    if (href === currentHref) {
      setMobileNavigation(null);
      return;
    }
    if (pendingMobileHref === href) return;
    flushSync(() => {
      setMobileNavigation({ href, fromRoute: currentRoute });
    });
  }

  const assistantHref = buildHref("/assistant");
  const onAssistantPage = activeRoot === "/assistant";
  const mobileAssistantActive = pendingMobileHref ? pendingMobileHref === assistantHref : onAssistantPage;
  const mobileAssistantClass = "mobile-nav-item mobile-nav-assistant " + (mobileAssistantActive ? "is-active" : "");
  const mobileAssistantPending = pendingMobileHref === assistantHref;
  const mobileAssistantContent = (
    <>
      <span className="mobile-nav-icon mobile-nav-assistant-icon">
        <AssistantNavIcon className="h-5 w-5" />
      </span>
      <span className="mobile-nav-label">{mobileAssistantPending ? "Opening…" : "Assistant"}</span>
    </>
  );

  const primaryMobileActive = mobileLinks.some((item) => isMobileActive(item)) || mobileAssistantActive;
  const moreActive = mobileOpen || !primaryMobileActive;

  const allowed = (item: NavLink) => item.href !== "/operations" || (canAdmin && basePath === "/v2");
  const matches = (item: NavLink) => `${item.label} ${item.description}`.toLowerCase().includes(navQuery.trim().toLowerCase());
  const noMatches = ![...startLinks, ...dailyRhythmLinks, ...growthLinks, ...resourceLinks, ...accountLinks].some(item => allowed(item) && matches(item));
  const navItems = (items: NavLink[], dense = false, onNavigate?: () => void, rail = false) =>
    items.filter(item => allowed(item) && (rail || matches(item))).map(item => (
      <Link key={item.href} href={buildHref(item.href)}
        onClick={() => { setNavQuery(""); onNavigate?.(); }}
        aria-current={isActive(item) ? "page" : undefined}
        aria-label={rail ? item.label : undefined}
        title={rail ? item.label : undefined}
        className={`${styles.link} ${dense ? styles.touchLink : ""} ${rail ? styles.railLink : ""}`}>
        <NavigationIcon label={item.label} />
        <span className={rail ? "sr-only" : styles.linkLabel}>{item.label}</span>
      </Link>
    ));
  const search = (id: string) => <div className={styles.search}>
    <label className="sr-only" htmlFor={id}>Find a page</label>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
    <input id={id} type="search" placeholder="Find a page…" value={navQuery} onChange={event => setNavQuery(event.target.value)} autoComplete="off" />
  </div>;
  const groups = (mobileMenu = false) => <>
    <NavGroup title="Workspace">{navItems(startLinks, mobileMenu, mobileMenu ? closeMobileSidebar : undefined)}</NavGroup>
    <NavGroup title="Personal">{navItems([...dailyRhythmLinks, ...growthLinks], mobileMenu, mobileMenu ? closeMobileSidebar : undefined)}</NavGroup>
    <NavGroup title="Resources">{navItems(resourceLinks, mobileMenu, mobileMenu ? closeMobileSidebar : undefined)}</NavGroup>
    <NavGroup title="Account">{navItems(accountLinks, mobileMenu, mobileMenu ? closeMobileSidebar : undefined)}</NavGroup>
    {noMatches && <p className={styles.empty} role="status">No matching pages.</p>}
  </>;

  return (
    <>
      <aside data-expanded={desktopOpen} aria-label="Sidebar" className={`jarvis-desktop-sidebar ${styles.desktop}`}>
        <header className={styles.brandRow}>
          {desktopOpen && <Link href={buildHref("/")} aria-label="Jarvis home" className={styles.brand}><span aria-hidden="true">J</span>Jarvis</Link>}
          <button type="button" onClick={() => { setNavQuery(""); updateDesktopOpen(!desktopOpen); }}
            className={styles.iconButton} aria-label={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={desktopOpen} title={desktopOpen ? "Collapse sidebar" : "Expand sidebar"}>
            {desktopOpen ? <SidebarCollapseIcon className="h-5 w-5" /> : <SidebarExpandIcon className="h-5 w-5" />}
          </button>
        </header>
        {desktopOpen ? <>
          {search("desktop-page-search")}
          <nav aria-label="Main navigation" className={styles.navigation}>{groups()}</nav>
          <div className={styles.footer}><ShellControls expanded={shellExpanded} onExpandedChange={updateShellExpanded}
            sessionEmail={session?.user?.email} theme={theme} setTheme={setTheme}
            syncStatus={syncStatus} onRefresh={refreshRemoteState} /></div>
        </> : <>
          <nav aria-label="Quick navigation" className={styles.rail}>{navItems([...startLinks, resourceLinks[0]], false, undefined, true)}
            <button type="button" className={`${styles.iconButton} ${styles.allPages}`} aria-label="Show all pages" title="Show all pages" onClick={() => updateDesktopOpen(true)}><MoreNavIcon className="h-5 w-5" /></button>
          </nav>
          <Link href={buildHref("/settings")} aria-label="Settings" title="Settings" className={`${styles.link} ${styles.railLink} ${styles.railFooter}`}><NavigationIcon label="Settings" /></Link>
        </>}
      </aside>

      <nav
        data-no-pull-refresh="true"
        className="jarvis-mobile-nav relative order-last z-40 shrink-0 lg:hidden"
        aria-label="Primary mobile navigation"
      >
          <div className="jarvis-mobile-nav-row mx-auto grid max-w-xl grid-cols-5 gap-1">
            <MobileBarLink
              item={mobileLinks[0]}
              active={isMobileActive(mobileLinks[0])}
              href={buildHref(mobileLinks[0].href)}
              pending={pendingMobileHref === buildHref(mobileLinks[0].href)}
              onNavigate={beginMobileNavigation}
            />
            <MobileBarLink
              item={mobileLinks[1]}
              active={isMobileActive(mobileLinks[1])}
              href={buildHref(mobileLinks[1].href)}
              pending={pendingMobileHref === buildHref(mobileLinks[1].href)}
              onNavigate={beginMobileNavigation}
            />
            <Link
              href={assistantHref}
              aria-label="Open assistant"
              aria-current={onAssistantPage ? "page" : undefined}
              aria-busy={mobileAssistantPending || undefined}
              data-navigation-state={mobileAssistantPending ? "pending" : mobileAssistantActive ? "active" : "idle"}
              onClick={(event) => {
                if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) beginMobileNavigation(assistantHref);
              }}
              className={mobileAssistantClass}
            >
              {mobileAssistantContent}
            </Link>
            <MobileBarLink
              item={mobileLinks[2]}
              active={isMobileActive(mobileLinks[2])}
              href={buildHref(mobileLinks[2].href)}
              pending={pendingMobileHref === buildHref(mobileLinks[2].href)}
              onNavigate={beginMobileNavigation}
            />
            <button
              type="button"
              onClick={() => {
                setMobileNavigation(null);
                setMobileOpen(true);
              }}
              className={"mobile-nav-item " + (moreActive ? "is-active" : "")}
              aria-label="Open more navigation"
              aria-expanded={mobileVisible}
              aria-controls="mobile-navigation-drawer"
            >
              <span className="mobile-nav-icon"><MoreNavIcon className="h-4 w-4" /></span>
              <span className="mobile-nav-label">More</span>
            </button>
          </div>
      </nav>

      {mobileVisible && (
        <div data-no-pull-refresh="true" className={`fixed inset-0 z-50 flex mobile-sidebar-overlay lg:hidden ${styles.overlay}`}>
          <div
            ref={mobileDrawerRef}
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            tabIndex={-1}
            data-guide-shell={guidedShell || undefined}
            className={"mobile-sidebar theme-modal " + styles.drawer + " " + (guidedTheme ? "is-guided-theme" : guidedShell ? "is-guided-navigation" : "")}
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            }}
          >
            <div className={styles.drawerHeader}>
              <p id="mobile-navigation-title">All pages</p>
              <button
                type="button"
                data-sidebar-close
                onClick={closeMobileSidebar}
                className={styles.closeButton}
              >
                {guidedTheme ? "Close tour" : guidedShell ? "Close menu" : "Close"}
              </button>
            </div>
            {!guidedTheme && search("mobile-page-search")}
            <nav aria-label="All pages navigation" hidden={guidedTheme} className={guidedTheme ? "hidden" : styles.navigation}>{groups(true)}</nav>
            <ShellControls
              expanded={shellExpanded}
              onExpandedChange={updateShellExpanded}
              sessionEmail={session?.user?.email}
              theme={theme}
              setTheme={setTheme}
              syncStatus={syncStatus}
              onRefresh={refreshRemoteState}
            />
            {guidedShell && <WalkthroughCoach inMobileSidebar />}
          </div>
          <button type="button" className="h-full flex-1" onClick={closeMobileSidebar}>
            <span className="sr-only">Close menu</span>
          </button>
        </div>
      )}
    </>
  );
}

function MobileBarLink({
  item,
  active,
  href,
  pending,
  onNavigate,
}: {
  item: NavLink;
  active: boolean;
  href: string;
  pending: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active && !pending ? "page" : undefined}
      aria-busy={pending || undefined}
      data-navigation-state={pending ? "pending" : active ? "active" : "idle"}
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate(href);
      }}
      className={"mobile-nav-item " + (active ? "is-active" : "")}
    >
      <span className="mobile-nav-icon"><MobileNavIcon label={item.label} className="h-5 w-5" /></span>
      <span className="mobile-nav-label">{pending ? "Opening…" : item.label}</span>
    </Link>
  );
}

function NavigationIcon({ label }: { label: string }) {
  if (label === "Home") return <HomeNavIcon className={styles.navIcon} />;
  if (label === "Plan") return <PlanNavIcon className={styles.navIcon} />;
  if (label === "Finances") return <FinanceNavIcon className={styles.navIcon} />;
  if (label === "Assistant") return <AssistantNavIcon className={styles.navIcon} />;
  const paths: Record<string, string> = {
    Operations: "M3 12h4l3-7 4 14 3-7h4",
    "Must Win": "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
    Habits: "M4 7h11a5 5 0 0 1 0 10H9M4 7l3-3M4 7l3 3M20 17l-3 3M20 17l-3-3",
    Mood: "M8 9h.01M16 9h.01M7 14c2 4 8 4 10 0M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
    Journal: "M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5",
    Sleep: "M20 14a8 8 0 0 1-10-10 9 9 0 1 0 10 10Z",
    Objectives: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 11v2",
    Review: "M4 20h16M7 16v-5M12 16V5M17 16v-8",
    "Real Estate": "M4 21V4h10v17M14 10h6v11M7 8h3M7 12h3M7 16h3",
    Homelab: "M4 3h16v7H4ZM4 14h16v7H4ZM7 6h.01M7 17h.01M12 6h5M12 17h5",
    Docs: "M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h6",
    "User guide": "M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3ZM12 6v15",
    Settings: "M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6",
    Account: "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 21v-2a8 6 0 0 1 16 0v2",
    Admin: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6",
  };
  return <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[label] ?? paths.Docs} /></svg>;
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

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  if (Children.count(children) === 0) return null;
  return <div className={styles.group}><p>{title}</p><div>{children}</div></div>;
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
    return { label: "Opening workspace", detail: "Restoring this device, then checking Jarvis", toneClass: "bg-zinc-400 animate-pulse" };
  }
  if (syncStatus.local === "error") {
    return { label: "Device save issue", detail: syncStatus.error ?? "This device could not store the latest change", toneClass: "bg-red-500" };
  }
  if (syncStatus.remote === "saving") {
    return { label: "Saving to Jarvis", detail: "Your change is already safe on this device", toneClass: "bg-cyan-300 animate-pulse" };
  }
  if (syncStatus.remote === "refreshing") {
    return { label: "Checking for changes", detail: "Comparing this device with Jarvis", toneClass: "bg-cyan-300 animate-pulse" };
  }
  if (syncStatus.remote === "pending") {
    return { label: "Saved on this device", detail: "Waiting for Jarvis to confirm the sync", toneClass: "bg-amber-400" };
  }
  if (syncStatus.remote === "offline" || syncStatus.remote === "error") {
    return {
      label: syncStatus.remote === "error" ? "Sync needs another try" : "Working offline",
      detail: syncStatus.remote === "error" ? "Your changes are safe on this device" : "Changes will sync when you reconnect",
      toneClass: syncStatus.remote === "error" ? "bg-red-500" : "bg-amber-400",
    };
  }
  if (syncStatus.remote === "saved") {
    return { label: "All caught up", detail: lastSaved, toneClass: "bg-emerald-500" };
  }
  return { label: "Saved on this device", detail: lastSaved, toneClass: "bg-emerald-500" };
}

function formatShellTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function ShellControls({
  expanded,
  onExpandedChange,
  sessionEmail,
  theme,
  setTheme,
  syncStatus,
  onRefresh,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  sessionEmail?: string | null;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  syncStatus: StateSyncStatus;
  onRefresh: () => Promise<boolean>;
}) {
  const panelId = useId();
  const status = getSaveStatusDisplay(syncStatus);
  const refreshDisabled =
    syncStatus.local === "loading" ||
    syncStatus.remote === "saving" ||
    syncStatus.remote === "refreshing";

  function updateTheme(patch: Partial<ThemePreference>) {
    const next = updateThemePreference(patch);
    setTheme(next);
  }

  return (
    <div data-guide="quick-theme" className="quick-theme-controls theme-surface mt-auto max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain rounded-[24px] p-2 text-xs">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="theme-button-secondary flex min-w-0 flex-1 items-center gap-2 rounded-[18px] px-2 py-2 text-left transition"
          data-guide="quick-theme-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? "Hide quick settings controls" : "Show quick settings controls"}
        >
          <span className="min-w-0 flex-1">
            <span className="theme-text block text-xs font-semibold leading-4">Quick Settings</span>
            <span className="theme-muted mt-0.5 flex min-w-0 items-center gap-1 text-[10px]"><span className={`h-2 w-2 shrink-0 rounded-full ${status.toneClass}`} /><span className="truncate">{status.label}</span></span>
          </span>
          <span className="theme-muted text-[11px] font-semibold">{expanded ? "Hide" : "Show"}</span>
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
        <div id={panelId} className="mt-2 space-y-2 border-t border-white/10 pt-2">
          <div data-guide="quick-theme-mode" className="theme-card rounded-2xl p-2">
            <p className="theme-muted px-1 text-[9px] font-semibold uppercase tracking-[0.24em]">Mode</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {themeModeOptions.map((option) => {
                const active = theme.mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.description}
                    aria-label={option.label}
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
          <div data-guide="quick-theme-palette" className="theme-card rounded-2xl p-2">
            <p className="theme-muted px-1 text-[9px] font-semibold uppercase tracking-[0.24em]">Color palette</p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              {themePaletteOptions.map((option) => {
                const active = theme.palette === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.description}
                    aria-label={option.label}
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
          <StateSaveStatus syncStatus={syncStatus} />
          {sessionEmail && (
            <div className="theme-card rounded-2xl px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-400">Signed in</p>
              <p className="mt-1 truncate text-xs text-white/80">{sessionEmail}</p>
            </div>
          )}
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
