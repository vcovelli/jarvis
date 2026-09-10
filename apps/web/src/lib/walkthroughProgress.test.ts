import assert from "node:assert/strict";
import test from "node:test";
import { guideForPath, matchesGuideRoute, userGuides } from "./userGuides.ts";
import { freshProgress, parseProgress, recordGuide, resumeStep, shouldWelcome, walkthroughKey } from "./walkthroughProgress.ts";

test("personal and demo walkthroughs are isolated by account", () => {
  assert.notEqual(walkthroughKey("alice", true), walkthroughKey("alice", false));
  assert.notEqual(walkthroughKey("alice", false), walkthroughKey("bob", false));
});

test("only a new personal workspace gets the one-time welcome", () => {
  assert.equal(shouldWelcome(freshProgress(), false), true);
  assert.equal(shouldWelcome(freshProgress(), true), false);
  assert.equal(shouldWelcome(freshProgress(true), false), false);
});

test("Next saves the next tip and never makes an automatic tour eligible again", () => {
  const started = recordGuide(freshProgress(), "essentials", 0, "in-progress", 1000);
  const next = recordGuide(started, "essentials", 1, "in-progress", 2000);
  const loaded = parseProgress(JSON.stringify(next));
  assert.equal(resumeStep(loaded, "essentials"), 1);
  assert.equal(loaded.guides.essentials.stepId, "theme-palette");
  assert.equal(shouldWelcome(loaded, false), false);
});

test("closing, completing, and old dismissals all stay quiet after reload", () => {
  for (const status of ["skipped", "completed", "dismissed"] as const) {
    const loaded = parseProgress(JSON.stringify(recordGuide(freshProgress(), "mood", 1, status, 1)));
    assert.equal(shouldWelcome(loaded, false), false);
    assert.equal(resumeStep(loaded, "mood"), status === "skipped" ? 1 : 0);
  }
});

test("manual resume preserves the tip; replay starts at the first without re-enabling prompts", () => {
  const saved = recordGuide(freshProgress(), "essentials", 5, "skipped", 1000);
  const resumed = recordGuide(saved, "essentials", resumeStep(saved, "essentials"), "in-progress", 2000);
  assert.equal(resumed.guides.essentials.step, 5);
  const replay = recordGuide(saved, "essentials", 0, "in-progress", 3000);
  assert.equal(replay.guides.essentials.step, 0);
  assert.equal(shouldWelcome(replay, false), false);
});

test("old opt outs and week-old skipped guides migrate without another prompt", () => {
  assert.equal(shouldWelcome(parseProgress(JSON.stringify({ version: 2, neverPrompt: true })), false), false);
  const loaded = parseProgress(JSON.stringify({ version: 2, welcomed: true, lastPromptAt: 1, guides: {
    essentials: { status: "skipped", step: 3, remindAfter: 1, updatedAt: 1 },
  } }));
  assert.equal(shouldWelcome(loaded, false), false);
  assert.equal(loaded.guides.essentials.stepId, "habits-start");
  assert.equal(userGuides[0].steps[resumeStep(loaded, "essentials")].id, "habits-start");
});

test("stable step IDs preserve progress when numeric indexes change", () => {
  const loaded = parseProgress(JSON.stringify({ version: 2, guides: {
    essentials: { status: "in-progress", step: 0, stepId: "mood-start", updatedAt: 100 },
  } }));
  assert.equal(userGuides[0].steps[resumeStep(loaded, "essentials")].id, "mood-start");
  assert.equal(shouldWelcome(loaded, false), false);
});

test("fresh demo progress does not mutate personal guide history", () => {
  const personal = recordGuide(freshProgress(), "plan", 2, "skipped", 1000);
  const demo = recordGuide(freshProgress(true), "essentials", 0, "in-progress", 2000);
  assert.equal(personal.guides.plan.step, 2);
  assert.equal(demo.guides.plan, undefined);
});

test("storage loading handles malformed data, clamps steps, and ignores unknown guides", () => {
  assert.deepEqual(parseProgress("{"), freshProgress());
  assert.deepEqual(parseProgress(null), freshProgress());
  const loaded = parseProgress(JSON.stringify({ version: 2, welcomed: true, guides: {
    mood: { status: "skipped", step: 999, updatedAt: "bad" },
    removed: { status: "completed", step: 0 }, plan: { status: "invalid" },
  } }));
  assert.equal(loaded.guides.mood.step, 2);
  assert.equal(loaded.guides.mood.updatedAt, 0);
  assert.deepEqual(Object.keys(loaded.guides), ["mood"]);
});

test("all module routes have a guide, including both planner URLs", () => {
  for (const route of ["", "daily", "todos", "assistant", "must-win", "habits", "mood", "journal", "sleep", "review", "finance", "real-estate", "objectives", "homelab", "documentation", "settings", "account"]) {
    assert.ok(guideForPath("/v2" + (route ? "/" + route : "")), route || "home");
  }
  assert.ok(matchesGuideRoute("/v2/todos", "/v2/daily?mode=backlog"));
  assert.equal(new Set(userGuides.map((guide) => guide.id)).size, userGuides.length);
  for (const guide of userGuides) {
    assert.ok(guide.steps.length > 0);
    assert.equal(new Set(guide.steps.map((step) => step.id)).size, guide.steps.length);
    for (const step of guide.steps) assert.ok(step.route.startsWith("/v2"));
  }
});

test("quick start teaches quick settings and its collapse before daily tracking and Review", () => {
  const guide = userGuides.find((item) => item.id === "essentials")!;
  assert.deepEqual(guide.steps.slice(0, 3).map((step) => step.shell), ["theme", "theme", "theme-collapse"]);
  assert.ok(guide.steps.slice(0, 3).every((step) => step.route === "/v2"));
  assert.equal(guide.steps[2].target, '[data-guide="quick-theme-toggle"]');
  assert.deepEqual(guide.steps.slice(3).map((step) => step.route), [
    "/v2/must-win", "/v2/daily", "/v2/habits", "/v2/sleep", "/v2/mood", "/v2/review",
  ]);
  assert.ok(guide.steps.every((step) => step.target && step.anchor?.label));
  assert.ok(guide.minutes <= 3);
});

test("retired page guides cannot be discovered or restored", () => {
  const retired = ["manufacturing", "career", "fitness", "focus"];
  const stored = parseProgress(JSON.stringify({ version: 2, welcomed: true, guides: Object.fromEntries(
    retired.map((id) => [id, { status: "skipped", step: 0, updatedAt: 1 }]),
  ) }));
  assert.deepEqual(stored.guides, {});
  for (const id of retired) {
    assert.equal(guideForPath(`/v2/${id}`), undefined);
    assert.ok(userGuides.every((guide) => guide.id !== id && guide.steps.every((step) => step.route.split("?")[0] !== `/v2/${id}`)));
  }
});
