"use client";

import { useMemo, useState } from "react";

import { JournalPrompt, JarvisState, getDayKey, useJarvisState } from "@/lib/jarvisStore";

const promptCopy: Record<JournalPrompt, string> = {
  morning: "Morning scan",
  priority: "Priority focus",
  free: "Free log",
};

export default function JournalPage() {
  const { state, hydrated, addJournal } = useJarvisState();
  const todayKey = getDayKey();
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState<JournalPrompt | undefined>();
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  const calendarCells = useMemo(() => buildMonthCalendar(state), [state]);
  const entriesForDay = state.journal[selectedDay] ?? [];
  const totalEntries = Object.values(state.journal).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading journal…</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    addJournal({ text: trimmed, prompt, day: selectedDay });
    setText("");
    setPrompt(undefined);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Journal</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Story grid</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Calendar view of every entry so you can revisit patterns and keep the streak alive.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">This month</h2>
            <span className="text-xs uppercase tracking-[0.4em] text-zinc-500">
              {new Date().toLocaleString("default", { month: "long", year: "numeric" })}
            </span>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-3 text-center text-sm">
            {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
              <p key={day} className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                {day}
              </p>
            ))}
            {calendarCells.map((cell, index) => {
              if (cell.type === "blank") {
                return <div key={`blank-${index}`} />;
              }
              const active = cell.key === selectedDay;
              return (
                <button
                  key={cell.key}
                  onClick={() => setSelectedDay(cell.key)}
                  className={`flex h-16 flex-col items-center justify-center rounded-2xl border transition ${
                    active
                      ? "border-pink-300/70 bg-white/10 text-white"
                      : cell.count > 0
                        ? "border-white/10 bg-white/5 text-zinc-100"
                        : "border-white/5 bg-transparent text-zinc-500"
                  }`}
                >
                  <span className="text-lg font-semibold">{cell.date.getDate()}</span>
                  <span className="text-[10px] uppercase tracking-[0.3em]">
                    {cell.count}x
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2">
          <h2 className="text-lg font-medium text-white">Add entry</h2>
          <p className="mt-1 text-sm text-zinc-300">Select a prompt or free-write.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(promptCopy) as JournalPrompt[]).map((key) => {
              const active = prompt === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPrompt(key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${active ? "bg-pink-300 text-zinc-900" : "bg-white/10 text-zinc-200"}`}
                >
                  {promptCopy[key]}
                </button>
              );
            })}
          </div>
          <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              placeholder={`Capture the narrative for ${new Date(selectedDay).toLocaleDateString()}.`}
            />
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-fuchsia-400 to-purple-500 px-4 py-3 text-sm font-semibold text-white"
            >
              Save entry
            </button>
            {status === "saved" && (
              <p className="text-sm text-emerald-300">Logged.</p>
            )}
          </form>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-zinc-400">
            {totalEntries} entries stored.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">
            Entries for {new Date(selectedDay).toLocaleDateString()}
          </h2>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
            {entriesForDay.length} entries
          </p>
        </div>
        <div className="mt-4 space-y-4">
          {entriesForDay.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing yet. Add an entry with the panel above.</p>
          ) : (
            entriesForDay.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3"
              >
                <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                  {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {entry.prompt ? ` • ${entry.prompt}` : ""}
                </p>
                <p className="mt-2 text-sm text-zinc-100">{entry.text}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

type CalendarCell =
  | { type: "blank" }
  | { type: "day"; date: Date; count: number; key: string };

function buildMonthCalendar(state: JarvisState): CalendarCell[] {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const cells: CalendarCell[] = [];
  const offset = startOfMonth.getDay();
  for (let i = 0; i < offset; i += 1) {
    cells.push({ type: "blank" });
  }
  for (let day = 1; day <= endOfMonth.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const key = getDayKey(date);
    const count = state.journal[key]?.length ?? 0;
    cells.push({ type: "day", date, count, key });
  }
  return cells;
}
