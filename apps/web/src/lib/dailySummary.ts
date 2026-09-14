import type { DayKey, HabitEntry, JarvisState } from "./jarvisStore.ts";

export function localDayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftDay(day: DayKey, amount: number): DayKey {
  const [year, month, date] = day.split("-").map(Number);
  return localDayKey(new Date(year, month - 1, date + amount, 12));
}

export function habitExistsOnDay(habit: HabitEntry, day: DayKey): boolean {
  // Preserve explicitly backfilled history, including entries before creation.
  if (habit.logs[day] && habit.logs[day] !== "empty") return true;
  return localDayKey(new Date(habit.createdTs)) <= day &&
    (!habit.archivedTs || localDayKey(new Date(habit.archivedTs)) > day);
}

export function habitStreak(habit: HabitEntry, day: DayKey, today: DayKey): number {
  let cursor = day;
  // An unfinished today must not erase yesterday's still-active streak.
  if (day === today && (!habit.logs[day] || habit.logs[day] === "empty")) cursor = shiftDay(day, -1);
  let count = 0;
  for (let i = 0; i < 3660; i += 1) {
    const status = habit.logs[cursor];
    if (status === "yes") count += 1;
    else if (status !== "skip") break;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}

export function habitPeriod(habit: HabitEntry, end: DayKey, days = 7) {
  const result = { done: 0, missed: 0, skipped: 0, unlogged: 0, total: 0 };
  for (let i = 0; i < days; i += 1) {
    const day = shiftDay(end, -i);
    if (!habitExistsOnDay(habit, day)) continue;
    result.total += 1;
    const status = habit.logs[day];
    if (status === "yes") result.done += 1;
    else if (status === "no") result.missed += 1;
    else if (status === "skip") result.skipped += 1;
    else result.unlogged += 1;
  }
  return result;
}

export type DailyInsight = { title: string; detail: string; href?: string; tone: "positive" | "neutral" | "attention" };
type SummaryState = Pick<JarvisState, "todos" | "habits" | "mood" | "sleep" | "mustWin" | "journal" | "dailyReview">;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const moodFor = (state: SummaryState, day: DayKey) => average((state.mood[day] ?? []).map((entry) => entry.mood).filter(Number.isFinite));
const sleepFor = (state: SummaryState, day: DayKey) => [...(state.sleep[day] ?? [])].filter((entry) => Number.isFinite(entry.durationMins) && entry.durationMins >= 0).sort((a, b) => b.ts - a.ts)[0];

export function buildDailySummary(state: SummaryState, day: DayKey, today = day) {
  const tasks = state.todos[day] ?? [];
  const isDone = (task: typeof tasks[number]) => task.done && (!task.completedTs || localDayKey(new Date(task.completedTs)) <= day);
  const completed = tasks.filter(isDone);
  const pending = tasks.filter((task) => !isDone(task)).sort((a, b) => a.priority - b.priority || (a.order ?? 0) - (b.order ?? 0));
  const habits = state.habits.filter((habit) => habitExistsOnDay(habit, day));
  const habitsDone = habits.filter((habit) => habit.logs[day] === "yes").length;
  const habitsSkipped = habits.filter((habit) => habit.logs[day] === "skip").length;
  const habitsMissed = habits.filter((habit) => habit.logs[day] === "no").length;
  const habitsUnlogged = habits.length - habitsDone - habitsSkipped - habitsMissed;
  const mood = moodFor(state, day);
  const sleep = sleepFor(state, day);
  const previousDays = Array.from({ length: 7 }, (_, i) => shiftDay(day, -i - 1));
  const previousMoods = previousDays.map((key) => moodFor(state, key)).filter((value): value is number => value !== null);
  const previousSleep = previousDays.map((key) => sleepFor(state, key)?.durationMins).filter((value): value is number => value !== undefined);
  const moodBaseline = previousMoods.length >= 3 ? average(previousMoods) : null;
  const sleepBaseline = previousSleep.length >= 3 ? average(previousSleep) : null;
  const priority = state.mustWin[day];
  const priorityDone = Boolean(priority?.done && (!priority.completedTs || localDayKey(new Date(priority.completedTs)) <= day));
  const journalCount = (state.journal[day] ?? []).length;
  const hasData = Boolean(tasks.length || habitsDone || habitsSkipped || habitsMissed || mood !== null || sleep || priority || journalCount);
  const insights: DailyInsight[] = [];

  if (priorityDone) insights.push({ title: "Your main priority is complete", detail: priority.text, href: "/v2/must-win", tone: "positive" });
  else if (completed.length) insights.push({ title: `${completed.length} planned task${completed.length === 1 ? "" : "s"} complete`, detail: completed.slice(0, 3).map((task) => task.text).join(" · "), href: "/v2/daily?mode=backlog", tone: "positive" });
  if (pending.length) insights.push({ title: `${pending.length} planned task${pending.length === 1 ? " remains" : "s remain"} open`, detail: "Choose what still matters before adding it to tomorrow. Your first unfinished priority: " + pending[0].text, href: "/v2/daily?mode=backlog", tone: "attention" });
  if (habitsUnlogged) insights.push({ title: `${habitsUnlogged} habit${habitsUnlogged === 1 ? " needs" : "s need"} a check-in`, detail: "Unlogged habits are left open, not counted as missed. Mark what happened before closing the day.", href: "/v2/habits", tone: "neutral" });
  else if (habitsDone) insights.push({ title: `${habitsDone} habit${habitsDone === 1 ? " kept" : "s kept"} on track`, detail: habits.filter((habit) => habit.logs[day] === "yes").slice(0, 3).map((habit) => habit.title).join(" · "), href: "/v2/habits", tone: "positive" });
  if (mood !== null && moodBaseline !== null && Math.abs(mood - moodBaseline) >= 0.5) {
    const delta = mood - moodBaseline;
    insights.push({ title: `Mood ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? "above" : "below"} your recent average`, detail: `Compared with ${previousMoods.length} logged days in the previous week. A useful observation to reflect on, not an explanation of what caused it.`, href: "/v2/mood", tone: delta > 0 ? "positive" : "neutral" });
  }
  if (sleep && sleepBaseline !== null && Math.abs(sleep.durationMins - sleepBaseline) >= 30) {
    const delta = sleep.durationMins - sleepBaseline;
    insights.push({ title: `Sleep was ${Math.abs(delta / 60).toFixed(1)}h ${delta > 0 ? "longer" : "shorter"} than usual`, detail: `Compared with your latest sleep entry on each of ${previousSleep.length} logged days in the previous week.`, href: "/v2/sleep", tone: "neutral" });
  }
  const repeatedReason = state.dailyReview[day]?.reason;
  if (state.dailyReview[day]?.expected === false && repeatedReason) {
    const count = previousDays.filter((key) => state.dailyReview[key]?.expected === false && state.dailyReview[key]?.reason === repeatedReason).length;
    if (count >= 2) insights.push({ title: "A recurring obstacle", detail: `${repeatedReason.replaceAll("-", " ")} appears in this review and ${count} others in the previous week. Choose one small adjustment for tomorrow.`, tone: "attention" });
  }
  const tomorrowSuggestion = priority && !priorityDone ? `Make time for ${priority.text}` : pending.length ? `Start with ${pending[0].text}` : "Choose one clear priority and leave room for the unexpected.";
  return {
    day, hasData, tasksTotal: tasks.length, tasksDone: completed.length,
    habitsTotal: habits.length, habitsDone, habitsSkipped, habitsMissed, habitsUnlogged,
    mood, moodCount: (state.mood[day] ?? []).length, sleepMinutes: sleep?.durationMins ?? null,
    priority, priorityDone, journalCount, insights, tomorrowSuggestion,
    bestStreak: Math.max(0, ...habits.map((habit) => habitStreak(habit, day, today))),
    headline: !hasData ? "Your day, at a glance" : priorityDone ? "You made room for what mattered." : completed.length ? "Progress worth carrying forward." : "Take a moment to close the day.",
  };
}
