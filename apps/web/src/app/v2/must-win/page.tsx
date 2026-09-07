"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { getDayKey, type TodoItem, useJarvisState } from "@/lib/jarvisStore";
import { formatTodoTimeWindow } from "@/lib/timeDisplay";
import { useToast } from "@/components/Toast";

export default function MustWinPage() {
  const { state, hydrated, syncStatus, setMustWin, toggleMustWin } = useJarvisState();
  const { showToast } = useToast();
  const todayKey = getDayKey();
  const todaysMustWin = state.mustWin[todayKey];
  const todos = useMemo(() => state.todos[todayKey] ?? [], [state.todos, todayKey]);
  const openTodos = useMemo(() => todos.filter((todo) => !todo.done), [todos]);
  const doneCount = todos.length - openTodos.length;
  const highPriorityOpen = useMemo(() => openTodos.filter((todo) => todo.priority === 1), [openTodos]);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftTimeBound, setDraftTimeBound] = useState<string | null>(null);
  const text = draftText ?? todaysMustWin?.text ?? "";
  const timeBound = draftTimeBound ?? todaysMustWin?.timeBound ?? "";
  const hasUnsavedDraft = draftText !== null && (
    text.trim() !== (todaysMustWin?.text ?? "")
    || timeBound.trim() !== (todaysMustWin?.timeBound ?? "")
  );

  if (!hydrated) {
    return <p className="theme-muted text-sm uppercase tracking-[0.3em]">Loading Must Win...</p>;
  }

  function commitDraft(notify: boolean) {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const trimmedTimeBound = timeBound.trim();
    const changed = trimmed !== todaysMustWin?.text || trimmedTimeBound !== (todaysMustWin?.timeBound ?? "");
    if (changed) {
      setMustWin({ day: todayKey, text: trimmed, timeBound: trimmedTimeBound || undefined });
    }
    setDraftText(trimmed);
    setDraftTimeBound(trimmedTimeBound);
    if (notify) showToast(changed ? (todaysMustWin ? "Must Win updated" : "Must Win locked") : "Must Win already saved");
    return changed;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitDraft(true);
  }

  function promoteTodo(todo: TodoItem) {
    const nextTimeBound = formatTodoTimeWindow(todo);
    setMustWin({
      day: todayKey,
      text: todo.text,
      timeBound: nextTimeBound || undefined,
    });
    setDraftText(todo.text);
    setDraftTimeBound(nextTimeBound);
    showToast("Task promoted to Must Win");
  }

  const completionRatio = todos.length ? Math.round((doneCount / todos.length) * 100) : 0;
  const winState = todaysMustWin?.done ? "Won" : todaysMustWin ? "In play" : "Unset";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="theme-kicker text-xs uppercase tracking-[0.35em]">Quick jump</p>
          <h1 className="theme-text mt-2 text-3xl font-semibold">Must Win</h1>
          <p className="theme-muted mt-2 max-w-xl text-sm leading-6">One binary outcome that keeps the day honest when everything else spreads out.</p>
        </div>
        <Link href="/v2" className="theme-button-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">
          Remote
        </Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <form
          className="theme-surface rounded-[28px] p-5"
          onSubmit={submit}
          onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              commitDraft(false);
            }
          }}
        >
          <p className="theme-kicker text-[10px] uppercase tracking-[0.32em]">Lock or refine</p>
          <div className="mt-4 grid gap-3">
            <textarea
              value={text}
              onChange={(event) => setDraftText(event.target.value)}
              rows={4}
              className="theme-input rounded-2xl px-4 py-3 text-base focus:outline-none"
              placeholder="What win would make today count?"
            />
            <input
              value={timeBound}
              onChange={(event) => setDraftTimeBound(event.target.value)}
              className="theme-input rounded-2xl px-4 py-3 text-base focus:outline-none"
              placeholder="Optional boundary, e.g. by 3:00 PM"
            />
            <button type="submit" className="theme-button-primary rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.24em]">
              {todaysMustWin ? "Update win" : "Lock the day"}
            </button>
            <p className="theme-muted text-center text-xs" aria-live="polite">
              {hasUnsavedDraft
                ? "Editing · save or leave the form to keep changes"
                : syncStatus.local === "error"
                ? "Could not save on this device"
                : syncStatus.remote === "saved"
                  ? "Saved and synced"
                  : syncStatus.remote === "saving" || syncStatus.remote === "pending"
                    ? "Saved on this device · syncing"
                    : syncStatus.remote === "offline" || syncStatus.remote === "error"
                      ? "Saved on this device · sync pending"
                      : "Changes save when you leave this form"}
            </p>
          </div>
        </form>

        <section className="theme-surface rounded-[28px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="theme-kicker text-[10px] uppercase tracking-[0.32em]">Promote from tasks</p>
              <h2 className="theme-text mt-1 text-lg font-semibold">Open today</h2>
            </div>
            <span className="theme-pill rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]">{openTodos.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {openTodos.length ? openTodos.slice(0, 8).map((todo) => (
              <div key={todo.id} className="theme-card rounded-2xl px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="theme-text break-words text-sm font-semibold">{todo.text}</p>
                    <p className="theme-muted mt-1 text-[10px] uppercase tracking-[0.22em]">{formatTodoTimeWindow(todo) || priorityLabel(todo.priority)}</p>
                  </div>
                  <button type="button" onClick={() => promoteTodo(todo)} className="theme-button-secondary shrink-0 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">
                    Use this
                  </button>
                </div>
              </div>
            )) : <p className="theme-card rounded-2xl border-dashed px-4 py-5 text-center text-sm theme-muted">No open tasks for today. Use the mind sweep if your next win is still fuzzy.</p>}
          </div>
        </section>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="theme-surface rounded-[28px] p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="theme-kicker text-[10px] uppercase tracking-[0.32em]">Today</p>
              <h2 className="theme-text mt-2 text-2xl font-semibold leading-snug">
                {todaysMustWin?.text ?? "No win locked yet"}
              </h2>
              {todaysMustWin?.timeBound && <p className="theme-accent-text mt-2 text-xs font-semibold uppercase tracking-[0.24em]">{todaysMustWin.timeBound}</p>}
              <p className="theme-muted mt-3 text-sm leading-6">
                {todaysMustWin?.done
                  ? "Closed. Keep the review honest and decide what tomorrow inherits."
                  : todaysMustWin
                    ? "Keep this visible. Everything else is support, noise, or later."
                    : "Choose the one outcome that would make today count."}
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-44">
              <span className="theme-pill is-active rounded-full px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.24em]">{winState}</span>
              {todaysMustWin && (
                <button
                  type="button"
                  onClick={() => toggleMustWin({ day: todayKey })}
                  className="theme-button-primary rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em]"
                >
                  {todaysMustWin.done ? "Reopen" : "Mark won"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <WinMetric label="Open" value={String(openTodos.length)} detail="tasks left" />
            <WinMetric label="Done" value={String(doneCount)} detail={String(completionRatio) + "% complete"} />
            <WinMetric label="Priority" value={String(highPriorityOpen.length)} detail="top pressure" />
          </div>
        </div>

        <aside className="theme-surface rounded-[28px] p-5">
          <p className="theme-kicker text-[10px] uppercase tracking-[0.32em]">Next moves</p>
          <div className="mt-4 grid gap-2">
            <Link href="/v2/daily?mode=backlog" className="theme-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
              Mind sweep loose work
            </Link>
            <Link href="/v2/daily" className="theme-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
              Open planner
            </Link>
            <Link href="/v2/review" className="theme-button-secondary rounded-2xl px-4 py-3 text-sm font-semibold">
              Review the loop
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}

function WinMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="theme-card rounded-2xl p-4">
      <p className="theme-muted text-[10px] uppercase tracking-[0.25em]">{label}</p>
      <p className="theme-text mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="theme-muted mt-1 text-xs">{detail}</p>
    </div>
  );
}

function priorityLabel(priority: TodoItem["priority"]) {
  if (priority === 1) return "High priority";
  if (priority === 2) return "Medium priority";
  return "Low priority";
}
