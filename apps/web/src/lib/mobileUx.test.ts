import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("mobile shell honors device safe areas and 44px touch targets", () => {
  const rootLayout = read("../app/layout.tsx");
  const styles = read("../app/globals.css");

  assert.match(rootLayout, /viewportFit:\s*"cover"/);
  assert.match(styles, /--jarvis-mobile-nav-height:\s*calc\(env\(safe-area-inset-bottom/);
  assert.match(styles, /\.mobile-section-nav-item[\s\S]*min-height:\s*2\.75rem/);
  const sidebar = read("../components/Sidebar.tsx");
  assert.match(sidebar, /jarvis-mobile-nav relative order-last[^"]*shrink-0/);
  assert.doesNotMatch(sidebar, /jarvis-mobile-nav fixed/);
  assert.match(styles, /\.jarvis-pull-content\s*\{\s*flex:\s*1 0 auto/);
});

test("mobile primary and More navigation expose every major v2 module", () => {
  const sidebar = read("../components/Sidebar.tsx");
  const expectedRoutes = [
    "/assistant",
    "/daily?mode=backlog",
    "/must-win",
    "/habits",
    "/mood",
    "/journal",
    "/sleep",
    "/objectives",
    "/review",
    "/finance",
    "/real-estate",
    "/homelab",
    "/documentation",
    "/settings",
    "/account",
  ];

  for (const route of expectedRoutes) {
    assert.ok(sidebar.includes(`href: "${route}"`), `${route} should be reachable from navigation`);
  }
  assert.match(sidebar, /aria-label="Primary mobile navigation"/);
  assert.match(sidebar, /role="dialog"[\s\S]*aria-modal="true"[\s\S]*mobile-navigation-title/);
});

test("high-density domains use focused mobile views and Home offers voice capture", () => {
  const finance = read("../app/v2/finance/page.tsx");
  const realEstate = read("../app/v2/real-estate/page.tsx");
  const homelab = read("../app/v2/homelab/HomelabConsoleClient.tsx");
  const home = read("../app/v2/page.tsx");

  for (const label of ["Snapshot", "Spending", "Accounts", "Activity", "Invest"]) {
    assert.ok(finance.includes(`label: "${label}"`), `Finance should include ${label}`);
  }
  for (const label of ["Leads", "Filters", "Analysis", "Map"]) {
    assert.ok(realEstate.includes(`label: "${label}"`), `Real Estate should include ${label}`);
  }
  for (const label of ["Overview", "Live metrics", "Services"]) {
    assert.ok(homelab.includes(`label: "${label}"`), `Homelab should include ${label}`);
  }
  assert.match(home, /href="\/v2\/assistant\?voice=1"/);
});

test("mobile refresh follows the gesture, settles flush, and hides short-lived sync work", () => {
  const pullToRefresh = read("../components/PullToRefresh.tsx");
  const pageViewport = read("../components/PageViewport.tsx");
  const syncNotice = read("../components/MobileSyncStatus.tsx");
  const store = read("./jarvisStore.ts");

  assert.match(pullToRefresh, /refreshRef\.current\(\{ silent: true \}\)/);
  assert.match(pullToRefresh, /scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(pullToRefresh, /requestAnimationFrame/);
  assert.match(pullToRefresh, /function getPullOffset/);
  assert.match(pullToRefresh, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(pageViewport, /className="jarvis-pull-content/);
  assert.doesNotMatch(pullToRefresh, /Pull down to check|role="status"|getPresentation/);
  assert.match(pullToRefresh, /jarvis:pull-refresh/);
  assert.match(syncNotice, /BUSY_NOTICE_DELAY_MS\s*=\s*650/);
  assert.match(syncNotice, /pullRefreshActive\s*\?\s*null/);
  assert.match(store, /refreshInFlightRef/);
  assert.match(store, /fetchStateFromServer\(\{ etag: refreshMeta\?\.etag \}\)/);
});
