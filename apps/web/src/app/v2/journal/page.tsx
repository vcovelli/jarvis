"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  JournalPrompt,
  JournalEntry,
  DayKey,
  JarvisState,
  dayKeyToDate,
  getDayKey,
  normalizeDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";
import { useToast } from "@/components/Toast";

const promptCopy: Record<JournalPrompt, string> = {
  morning: "Morning",
  priority: "Priority",
  free: "Free log",
};

export default function JournalPage() {
  const { state, hydrated, addJournal, updateJournalEntry, deleteJournalEntry } = useJarvisState();
  const { showToast } = useToast();
  const search = useSearchParams();
  const todayKey = getDayKey();
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState<JournalPrompt | undefined>();
  const [editingEntry, setEditingEntry] = useState<{ day: DayKey; entry: JournalEntry } | null>(null);
  const focusEntryId = search?.get("focus") ?? null;
  const focusDay = search?.get("day");
  const focusRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const calendarCells = useMemo(() => buildMonthCalendar(state), [state]);
  const entriesForDay = state.journal[selectedDay] ?? [];
  const totalEntries = Object.values(state.journal).reduce(
    (sum, list) => sum + list.length,
    0,
  );

  useEffect(() => {
    if (!focusDay) return;
    const normalized = normalizeDayKey(focusDay);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedDay(normalized);
  }, [focusDay]);

  useEffect(() => {
    if (!focusRef.current) return;
    focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusEntryId, selectedDay, entriesForDay.length]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (editingEntry) {
      updateJournalEntry({
        day: editingEntry.day,
        id: editingEntry.entry.id,
        updates: { text: trimmed, prompt },
      });
      showToast("Journal updated");
      setEditingEntry(null);
    } else {
      addJournal({ text: trimmed, prompt, day: selectedDay });
      showToast("Journal saved");
    }
    setText("");
    setPrompt(undefined);
  };

  const handleEditEntry = (entry: JournalEntry, day: DayKey) => {
    setEditingEntry({ day, entry });
    setSelectedDay(day);
    setText(entry.text);
    setPrompt(entry.prompt);
  };

  const handleCancelEdit = useCallback(() => {
    setEditingEntry(null);
    setText("");
    setPrompt(undefined);
  }, []);

  const handleDeleteEntry = (entry: JournalEntry, day: DayKey) => {
    deleteJournalEntry({ day, id: entry.id });
    if (editingEntry?.entry.id === entry.id) {
      handleCancelEdit();
    }
    showToast("Journal deleted");
  };

  const isEditing = Boolean(editingEntry);
  const submitLabel = isEditing ? "Save changes" : "Save entry";
  const updateSelectedDay = useCallback(
    (day: DayKey) => {
      setSelectedDay(day);
      if (editingEntry && editingEntry.day !== day) {
        handleCancelEdit();
      }
    },
    [editingEntry, handleCancelEdit],
  );

  useEffect(() => {
    if (!editingEntry) return undefined;
    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        handleCancelEdit();
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [editingEntry, handleCancelEdit]);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading journal…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="hidden lg:block">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Journal</p>
      </header>
      <div className="lg:hidden">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Journal</p>
      </div>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="glass-panel rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/0 to-white/5 p-6 backdrop-blur-lg lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-medium text-white">This month</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.4em] text-zinc-500">
                {new Date().toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => updateSelectedDay(todayKey)}
                className="rounded-full border border-cyan-300/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200 transition hover:border-cyan-300"
              >
                Today
              </button>
            </div>
          </div>
          <div className="mt-6 pb-2 sm:overflow-x-auto">
            <div className="grid grid-cols-7 gap-2 text-center text-sm sm:min-w-[520px] sm:gap-3">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((day) => (
                <p key={day} className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 sm:text-[11px]">
                  {day}
                </p>
              ))}
              {calendarCells.map((cell, index) => {
                if (cell.type === "blank") {
                  return <div key={`blank-${index}`} />;
                }
                const active = cell.key === selectedDay;
                const stickyCount = cell.count > 0;
                return (
                  <button
                    key={cell.key}
                    onClick={() => updateSelectedDay(cell.key)}
                    className={`relative flex h-12 flex-col items-center justify-center rounded-2xl border text-xs uppercase tracking-[0.25em] text-white/80 transition duration-200 ease-out sm:h-16 sm:text-sm ${
                      active
                        ? "border-pink-300/60 bg-gradient-to-br from-pink-400/20 to-purple-500/20 text-white shadow-lg shadow-pink-500/30"
                        : stickyCount
                          ? "border-white/15 bg-white/5 text-white/80 lg:hover:border-white/30 lg:hover:bg-white/10"
                          : "border-white/10 bg-white/0 text-zinc-500 lg:hover:border-white/20 lg:hover:bg-white/5"
                    } lg:hover:-translate-y-0.5 lg:hover:shadow-lg`}
                  >
                    <span className="text-base font-semibold tracking-normal sm:text-lg">
                      {cell.date.getDate()}
                    </span>
                    <span className="text-[9px] tracking-[0.4em] sm:text-[10px]">
                      {cell.count}x
                    </span>
                    {!stickyCount && !active && (
                      <span className="pointer-events-none absolute inset-0 rounded-2xl border border-white/0 lg:hover:border-white/10" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div
          ref={panelRef}
          className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2"
        >
          <h2 className="text-lg font-medium text-white">{isEditing ? "Edit entry" : "Add entry"}</h2>
          <p className="mt-1 text-sm text-zinc-300">
            {isEditing ? "Update the narrative and save your changes." : "Select a prompt or free-write."}
          </p>
          {editingEntry && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-zinc-300">
              <span>Editing: {dayKeyToDate(editingEntry.day).toLocaleDateString()}</span>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold text-white/80 hover:text-white"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {(Object.keys(promptCopy) as JournalPrompt[]).map((key) => {
              const active = prompt === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPrompt(key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition lg:hover:-translate-y-0.5 lg:hover:bg-white/20 ${
                    active
                      ? "bg-gradient-to-r from-pink-300 to-purple-400 text-zinc-900 shadow-lg shadow-pink-400/40"
                      : "bg-white/10 text-zinc-200"
                  }`}
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
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              rows={6}
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              placeholder={`Capture the narrative for ${dayKeyToDate(selectedDay).toLocaleDateString()}.`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded-2xl bg-gradient-to-r from-fuchsia-400 to-purple-500 px-4 py-3 text-sm font-semibold text-white"
              >
                {submitLabel}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleDeleteEntry(editingEntry.entry, editingEntry.day)}
                  className="rounded-2xl border border-red-500/60 px-4 py-3 text-sm font-semibold text-red-300 hover:border-red-400"
                >
                  Delete entry
                </button>
              )}
            </div>
          </form>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-zinc-400">
            {totalEntries} entries stored.
          </p>
        </div>
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-medium text-white">
            Entries for {dayKeyToDate(selectedDay).toLocaleDateString()}
          </h2>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
            {entriesForDay.length} entries
          </p>
        </div>
        <div className="mt-4 space-y-4">
          {entriesForDay.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing yet. Add an entry with the panel above.</p>
          ) : (
            entriesForDay.map((entry) => {
              const highlight = focusEntryId === entry.id;
              const editingThis = editingEntry?.entry.id === entry.id;
              return (
                <article
                  key={entry.id}
                  ref={highlight ? focusRef : undefined}
                  className={`rounded-2xl border border-white/5 bg-black/20 px-4 py-3 ${
                    highlight || editingThis ? "ring-2 ring-cyan-300/70" : ""
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">
                    {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {entry.prompt ? ` • ${entry.prompt}` : ""}
                  </p>
                  <p className="mt-2 break-words text-sm text-zinc-100">{entry.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditEntry(entry, selectedDay)}
                      className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70 hover:border-white/40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntry(entry, selectedDay)}
                      className="rounded-full border border-red-500/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-red-300 hover:border-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })
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
