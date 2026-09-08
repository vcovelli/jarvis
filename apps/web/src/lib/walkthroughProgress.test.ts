import assert from "node:assert/strict";
import test from "node:test";
import { guideForPath, matchesGuideRoute, userGuides } from "./userGuides.ts";
import { freshProgress, parseProgress, recordGuide, REMINDER_DELAY_MS, resumeStep, shouldSuggest, walkthroughKey } from "./walkthroughProgress.ts";

test("personal and demo walkthroughs are isolated by account", () => {
  assert.notEqual(walkthroughKey("alice", true), walkthroughKey("alice", false));
  assert.notEqual(walkthroughKey("alice", false), walkthroughKey("bob", false));
});

test("skip saves the current step and only allows a reminder after seven days", () => {
  const now = 1000;
  const skipped = recordGuide(freshProgress(), "essentials", 3, "skipped", now);
  assert.equal(resumeStep(skipped, "essentials"), 3);
  assert.equal(shouldSuggest(skipped, "essentials", now + REMINDER_DELAY_MS - 1), false);
  assert.equal(shouldSuggest(skipped, "essentials", now + REMINDER_DELAY_MS), true);
  assert.equal(shouldSuggest(skipped, "finance", now + 1), false);
});

test("completed and permanently dismissed guides never trigger reminders", () => {
  for (const status of ["completed", "dismissed"] as const) {
    const progress = recordGuide(freshProgress(), "mood", 1, status, 1000);
    assert.equal(shouldSuggest(progress, "mood", 1000 + REMINDER_DELAY_MS * 10), false);
    assert.equal(resumeStep(progress, "mood"), 0);
  }
});

test("global opt out prevents even unseen guide prompts and survives progress changes", () => {
  const progress = recordGuide({ ...freshProgress(true), neverPrompt: true }, "plan", 1, "in-progress", 1000);
  assert.equal(shouldSuggest(progress, "plan", 1000 + REMINDER_DELAY_MS * 2), false);
  assert.equal(shouldSuggest(progress, "finance", 1000 + REMINDER_DELAY_MS * 2), false);
});

test("fresh demo progress does not mutate the personal profile", () => {
  const personal = recordGuide({ ...freshProgress(true), neverPrompt: true }, "plan", 2, "dismissed", 1000);
  const demo = freshProgress(true);
  assert.deepEqual(demo.guides, {});
  assert.equal(demo.neverPrompt, false);
  assert.equal(personal.guides.plan.status, "dismissed");
  assert.equal(personal.neverPrompt, true);
});

test("storage loading handles malformed data, clamps old steps, and ignores unknown guides", () => {
  assert.deepEqual(parseProgress("{"), freshProgress());
  const loaded = parseProgress(JSON.stringify({ version: 2, welcomed: true, neverPrompt: true, lastPromptAt: -2, guides: {
    mood: { status: "skipped", step: 999, updatedAt: "bad", remindAfter: 200 },
    removed: { status: "completed", step: 0 }, plan: { status: "invalid" },
  } }));
  assert.equal(loaded.guides.mood.step, 2);
  assert.equal(loaded.guides.mood.updatedAt, 0);
  assert.deepEqual(Object.keys(loaded.guides), ["mood"]);
  assert.equal(loaded.neverPrompt, true);
  assert.equal(parseProgress(null, true).welcomed, true);
});

test("saved progress round trips and manual replay is available after dismissal", () => {
  const saved = recordGuide(freshProgress(), "mood", 1, "dismissed", 1000);
  const loaded = parseProgress(JSON.stringify(saved));
  const replay = recordGuide(loaded, "mood", resumeStep(loaded, "mood"), "in-progress", 2000);
  assert.equal(replay.guides.mood.step, 0);
  assert.equal(replay.guides.mood.status, "in-progress");
  assert.equal(replay.guides.mood.neverSuggest, true);
  assert.equal(shouldSuggest(replay, "mood", 2000 + REMINDER_DELAY_MS * 2), false);
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

test("quick start teaches only the daily loop, beginning at the real appearance controls", () => {
  const guide = userGuides.find((item) => item.id === "essentials")!;
  assert.deepEqual(guide.steps.map((step) => step.route), [
    "/v2/account?section=appearance", "/v2/must-win", "/v2/daily", "/v2/habits", "/v2/sleep", "/v2/mood",
  ]);
  assert.ok(guide.steps.every((step) => step.target && step.anchor?.label && step.event));
  assert.equal(guide.steps.length, 6);
  assert.ok(guide.minutes <= 3);
});

test("retired page guides cannot be discovered or restored from old saved progress", () => {
  const retired = ["manufacturing", "career", "fitness", "focus"];
  const stored = parseProgress(JSON.stringify({ version: 2, welcomed: true, guides: Object.fromEntries(
    retired.map((id) => [id, { status: "skipped", step: 0, updatedAt: 1, remindAfter: 1 }]),
  ) }));
  assert.deepEqual(stored.guides, {});
  for (const id of retired) {
    assert.equal(guideForPath(`/v2/${id}`), undefined);
    assert.equal(shouldSuggest(stored, id, REMINDER_DELAY_MS * 2), false);
    assert.ok(userGuides.every((guide) => guide.id !== id && guide.steps.every((step) => step.route.split("?")[0] !== `/v2/${id}`)));
  }
});
