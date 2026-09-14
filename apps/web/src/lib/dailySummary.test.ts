import assert from "node:assert/strict";
import test from "node:test";

import { buildDailySummary, habitPeriod, habitStreak, shiftDay } from "./dailySummary.ts";
import type { HabitEntry } from "./jarvisStore.ts";

type SummaryState = Parameters<typeof buildDailySummary>[0];

function emptyState(): SummaryState {
  return {
    todos: {},
    habits: [],
    mood: {},
    sleep: {},
    mustWin: {},
    journal: {},
    dailyReview: {},
  };
}

function habit(logs: HabitEntry["logs"]): HabitEntry {
  return {
    id: "habit-1",
    title: "Walk outside",
    icons: "☀️",
    intent: "build",
    createdTs: new Date("2026-09-01T12:00:00").valueOf(),
    updatedTs: new Date("2026-09-01T12:00:00").valueOf(),
    logs,
  };
}

test("daily summary counts logged activity and leaves empty habits unlogged", () => {
  const state = emptyState();
  state.todos["2026-09-14"] = [
    { id: "done", createdTs: 1, day: "2026-09-14", text: "Ship the update", done: true, priority: 1 },
    { id: "open", createdTs: 2, day: "2026-09-14", text: "Review tomorrow", done: false, priority: 2 },
  ];
  state.habits = [habit({ "2026-09-14": "yes" }), { ...habit({}), id: "habit-2", title: "Read" }];
  state.mood["2026-09-14"] = [{ id: "mood", ts: 1, mood: 8, tags: [] }];
  state.sleep["2026-09-14"] = [{ id: "sleep", ts: 1, day: "2026-09-14", durationMins: 450, quality: 4 }];
  state.mustWin["2026-09-14"] = { text: "Ship the update", done: true, ts: 1 };

  const summary = buildDailySummary(state, "2026-09-14");

  assert.equal(summary.tasksDone, 1);
  assert.equal(summary.habitsDone, 1);
  assert.equal(summary.habitsUnlogged, 1);
  assert.equal(summary.mood, 8);
  assert.equal(summary.sleepMinutes, 450);
  assert.equal(summary.priorityDone, true);
  assert.ok(summary.insights.some((insight) => insight.title.includes("habit")));
});

test("trend observations require enough history and use neutral language", () => {
  const state = emptyState();
  state.mood["2026-09-14"] = [{ id: "today", ts: 4, mood: 4, tags: [] }];
  for (const [index, day] of ["2026-09-11", "2026-09-12", "2026-09-13"].entries()) {
    state.mood[day] = [{ id: String(index), ts: index, mood: 7, tags: [] }];
  }

  const summary = buildDailySummary(state, "2026-09-14");
  const trend = summary.insights.find((insight) => insight.title.startsWith("Mood"));

  assert.ok(trend);
  assert.match(trend.detail, /not an explanation of what caused it/);
});

test("habit streak keeps yesterday active while today is unlogged", () => {
  const entry = habit({
    "2026-09-11": "yes",
    "2026-09-12": "yes",
    "2026-09-13": "yes",
  });

  assert.equal(habitStreak(entry, "2026-09-14", "2026-09-14"), 3);
  assert.deepEqual(habitPeriod(entry, "2026-09-14", 4), {
    done: 3,
    missed: 0,
    skipped: 0,
    unlogged: 1,
    total: 4,
  });
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28");
});
