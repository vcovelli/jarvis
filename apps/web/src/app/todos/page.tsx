"use client";

import { useMemo, useState } from "react";

import { DayKey, Timeblock, TodoItem, TodoPriority, getDayKey, useJarvisState } from "@/lib/jarvisStore";

const timeblockOptions: Timeblock[] = [15, 30, 45, 60, 90, 120];

export default function TodosPage() {
  const { state, hydrated, addTodo, toggleTodo, updateTodoPriority } = useJarvisState();
  const todayKey = getDayKey();
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState<TodoPriority>(1);
  const [timeblock, setTimeblock] = useState<Timeblock | undefined>();
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  const daysWithTodos = useMemo(() => buildDayKeys(state.todos), [state.todos]);
  const todosForDay = state.todos[selectedDay] ?? [];
  const upcoming = useMemo(() => buildUpcomingSchedule(state.todos), [state.todos]);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading planner…</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    addTodo({ text: trimmed, priority, timeblockMins: timeblock, day: selectedDay });
    setText("");
    setTimeblock(undefined);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Todos</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Mission planner</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Plan today in detail, peek ahead on the mini calendar, and keep recurring tasks grouped.
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-center gap-4">
          {daysWithTodos.map((day) => {
            const isActive = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive ? "bg-cyan-300 text-zinc-900" : "bg-white/10 text-zinc-200"
                }`}
              >
                {new Date(day).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </button>
            );
          })}
        </div>
        <form className="mt-6 grid gap-4 lg:grid-cols-[3fr,1fr,1fr,auto]" onSubmit={handleSubmit}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            placeholder="Add task"
          />
          <select
            value={priority}
            onChange={(event) => setPriority(Number(event.target.value) as TodoPriority)}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white"
          >
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                Priority {value}
              </option>
            ))}
          </select>
          <select
            value={timeblock ? timeblock.toString() : ""}
            onChange={(event) =>
              setTimeblock(
                event.target.value === "" ? undefined : (Number(event.target.value) as Timeblock),
              )
            }
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white"
          >
            <option value="">No block</option>
            {timeblockOptions.map((block) => (
              <option key={block} value={block}>
                {block}m block
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
          >
            Schedule
          </button>
        </form>
        {status === "saved" && <p className="mt-2 text-sm text-emerald-300">Added.</p>}

        <div className="mt-6 space-y-3">
          {todosForDay.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing scheduled for this day.</p>
          ) : (
            todosForDay.map((todo) => (
              <div
                key={todo.id}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/20 px-4 py-3"
              >
                <label className="flex flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 cursor-pointer accent-cyan-300"
                    checked={todo.done}
                    onChange={() => toggleTodo({ day: selectedDay, id: todo.id })}
                  />
                  <div>
                    <p className={`text-sm font-medium ${todo.done ? "text-zinc-500 line-through" : "text-white"}`}>
                      {todo.text}
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                      P{todo.priority}
                      {todo.timeblockMins ? ` • ${todo.timeblockMins}m block` : ""}
                    </p>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => updateTodoPriority({ day: selectedDay, id: todo.id, priority: nextPriority(todo.priority) })}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-200"
                >
                  P{todo.priority}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Calendar snapshots</h2>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Coming soon</p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {upcoming.map((slot) => (
            <div key={`${slot.day}-${slot.label}`} className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">{slot.dayLabel}</p>
              <p className="text-base font-semibold text-white">{slot.label}</p>
              <p className="text-sm text-zinc-400">{slot.meta}</p>
            </div>
          ))}
          {upcoming.length === 0 && (
            <p className="text-sm text-zinc-400">
              Add timeblocks to todos to populate this section. Calendar sync hooks in next phase.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function buildDayKeys(record: Record<DayKey, TodoItem[]>): DayKey[] {
  const keys = Object.keys(record);
  if (!keys.includes(getDayKey())) {
    keys.push(getDayKey());
  }
  return keys.sort((a, b) => (a > b ? 1 : -1)).slice(-7);
}

function buildUpcomingSchedule(record: Record<DayKey, TodoItem[]>) {
  const entries: { day: DayKey; dayLabel: string; label: string; meta: string }[] = [];
  Object.entries(record).forEach(([day, todos]) => {
    todos.forEach((todo) => {
      if (!todo.timeblockMins) return;
      entries.push({
        day,
        dayLabel: new Date(day).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        label: todo.text,
        meta: `${todo.timeblockMins}m block • P${todo.priority}`,
      });
    });
  });
  return entries.sort((a, b) => (a.day > b.day ? 1 : -1)).slice(0, 6);
}

function nextPriority(value: TodoPriority): TodoPriority {
  if (value === 3) return 1;
  return ((value + 1) as TodoPriority);
}
