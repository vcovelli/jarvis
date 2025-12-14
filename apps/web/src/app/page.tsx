"use client";

import { useMemo, useState } from "react";

import {
  JournalPrompt,
  JarvisState,
  MoodLog,
  MoodTag,
  Timeblock,
  TodoItem,
  TodoPriority,
  getDayKey,
  useJarvisState,
} from "@/lib/jarvisStore";

const moodTagOptions: MoodTag[] = ["energy", "stress", "sleep", "workout"];
const journalPromptCopy: Record<JournalPrompt, string> = {
  morning: "Morning scan: plan + intention",
  priority: "Top priority + blocker",
  free: "Free log",
};
const timeblockOptions: Timeblock[] = [15, 30, 60, 90, 120];

export default function Home() {
  const {
    state,
    hydrated,
    logMood,
    addJournal,
    addTodo,
    toggleTodo,
    updateTodoPriority,
  } = useJarvisState();

  const todayKey = getDayKey();
  const todaysTodos = state.todos[todayKey] ?? [];
  const todaysJournal = state.journal[todayKey] ?? [];
  const todaysMood = state.mood[todayKey] ?? [];

  const [moodValue, setMoodValue] = useState(5);
  const [moodNote, setMoodNote] = useState("");
  const [moodTags, setMoodTags] = useState<MoodTag[]>([]);
  const [moodStatus, setMoodStatus] = useState<"idle" | "saved">("idle");

  const [journalText, setJournalText] = useState("");
  const [journalPrompt, setJournalPrompt] =
    useState<JournalPrompt | undefined>();
  const [journalStatus, setJournalStatus] = useState<"idle" | "saved">("idle");

  const [todoText, setTodoText] = useState("");
  const [todoPriority, setTodoPriority] = useState<TodoPriority>(1);
  const [todoTimeblock, setTodoTimeblock] = useState<Timeblock | undefined>();
  const [todoStatus, setTodoStatus] = useState<"idle" | "saved">("idle");

  const timelineEntries = useMemo(() => buildTimeline(state), [state]);
  const latestMood = useMemo(() => getLatestMood(state), [state]);
  const streak = useMemo(() => calculateStreak(state), [state]);
  const hasMoodToday = todaysMood.length > 0;
  const hasJournalToday = todaysJournal.length > 0;
  const hasTodoDoneToday = todaysTodos.some((todo) => todo.done);
  const suggestions = useMemo(
    () =>
      buildSuggestions({
        hasMood: hasMoodToday,
        hasJournal: hasJournalToday,
        hasTodoDone: hasTodoDoneToday,
      }),
    [hasMoodToday, hasJournalToday, hasTodoDoneToday],
  );

  if (!hydrated) {
    return (
      <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">
        Loading console…
      </p>
    );
  }

  function handleMoodSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    logMood({ mood: moodValue, note: moodNote, tags: moodTags });
    setMoodValue(5);
    setMoodNote("");
    setMoodTags([]);
    setMoodStatus("saved");
    setTimeout(() => setMoodStatus("idle"), 2000);
  }

  function handleJournalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = journalText.trim();
    if (!trimmed) return;
    addJournal({ text: trimmed, prompt: journalPrompt });
    setJournalText("");
    setJournalPrompt(undefined);
    setJournalStatus("saved");
    setTimeout(() => setJournalStatus("idle"), 2000);
  }

  function handleTodoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = todoText.trim();
    if (!trimmed) return;
    addTodo({ text: trimmed, priority: todoPriority, timeblockMins: todoTimeblock });
    setTodoText("");
    setTodoTimeblock(undefined);
    setTodoStatus("saved");
    setTimeout(() => setTodoStatus("idle"), 2000);
  }

  function toggleMoodTag(tag: MoodTag) {
    setMoodTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">
          Jarvis Mode / v1 draft
        </p>
        <h1 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">
          Daily Systems Console
        </h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Mood + journal + todos in one HUD so the future chat agent can plug in
          without rewrites.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Mood Check-in</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Slider, note, and quick tags. Takes 60 seconds.
          </p>
          <form className="mt-6 flex flex-col gap-5" onSubmit={handleMoodSubmit}>
            <label className="text-sm font-medium text-zinc-200">
              Mood: <span className="text-cyan-300">{moodValue}/10</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={moodValue}
              onChange={(event) => setMoodValue(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded bg-zinc-700 accent-cyan-300"
            />
            <div className="flex flex-wrap gap-2">
              {moodTagOptions.map((tag) => {
                const active = moodTags.includes(tag);
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => toggleMoodTag(tag)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${active ? "bg-cyan-300 text-zinc-900" : "bg-white/10 text-zinc-300"}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <textarea
              placeholder="Anything notable?"
              value={moodNote}
              onChange={(event) => setMoodNote(event.target.value)}
              rows={4}
              className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-cyan-400 via-indigo-400 to-blue-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:opacity-90"
            >
              Log check-in
            </button>
            {moodStatus === "saved" && (
              <p className="text-sm text-emerald-300">Logged for today.</p>
            )}
          </form>
        </div>

        <TimelinePanel entries={timelineEntries} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <TodosPanel
          todos={todaysTodos}
          onSubmit={handleTodoSubmit}
          todoText={todoText}
          setTodoText={setTodoText}
          todoPriority={todoPriority}
          setTodoPriority={setTodoPriority}
          todoTimeblock={todoTimeblock}
          setTodoTimeblock={setTodoTimeblock}
          toggleTodo={(id) => toggleTodo({ day: todayKey, id })}
          updatePriority={(id, priority) =>
            updateTodoPriority({ day: todayKey, id, priority })
          }
          status={todoStatus}
        />

        <JournalPanel
          journalText={journalText}
          setJournalText={setJournalText}
          prompt={journalPrompt}
          onPromptSelect={(prompt) => {
            setJournalPrompt(prompt);
            if (!journalText) {
              setJournalText(`${journalPromptCopy[prompt]} — `);
            }
          }}
          onSubmit={handleJournalSubmit}
          status={journalStatus}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Recent Mood</h2>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-white">
              {latestMood?.mood ?? "–"}
            </span>
            <span className="text-sm text-zinc-300">last log</span>
          </div>
          <p className="mt-3 text-sm text-zinc-300">
            {latestMood
              ? latestMood.note || "Logged without a note."
              : "No entries logged yet. Add one to kick things off."}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Streak</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Mood + journal + one todo done.
          </p>
          <div className="mt-6 flex items-end gap-2">
            <span className="text-5xl font-semibold text-cyan-200">{streak}</span>
            <span className="text-sm text-zinc-400">days</span>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Up Next</h2>
          <ul className="mt-4 space-y-3 text-sm text-zinc-300">
            {suggestions.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

type TimelineEntry = {
  id: string;
  ts: number;
  title: string;
  detail: string;
  badge: string;
};

function buildTimeline(state: JarvisState, limit = 6): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  Object.values(state.mood).forEach((logs) => {
    logs.forEach((log) =>
      entries.push({
        id: `mood-${log.id}`,
        ts: log.ts,
        title: log.note || "Mood check-in",
        detail:
          `Mood ${log.mood}/10` +
          (log.tags?.length ? ` • ${log.tags.join(", ")}` : ""),
        badge: "Mood",
      }),
    );
  });

  Object.values(state.journal).forEach((entriesForDay) => {
    entriesForDay.forEach((entry) =>
      entries.push({
        id: `journal-${entry.id}`,
        ts: entry.ts,
        title: entry.text.slice(0, 80) + (entry.text.length > 80 ? "…" : ""),
        detail: entry.prompt ? `${entry.prompt} journal` : "Journal entry",
        badge: "Journal",
      }),
    );
  });

  Object.values(state.todos).forEach((todos) => {
    todos.forEach((todo) => {
      if (!todo.done && !todo.timeblockMins) return;
      entries.push({
        id: `todo-${todo.id}`,
        ts: todo.completedTs ?? todo.createdTs,
        title: todo.text,
        detail: todo.done
          ? `Completed • P${todo.priority}`
          : `${todo.timeblockMins}m block • P${todo.priority}`,
        badge: "Todo",
      });
    });
  });

  Object.values(state.sleep).forEach((nights) => {
    nights.forEach((night) =>
      entries.push({
        id: `sleep-${night.id}`,
        ts: night.ts,
        title: `${(night.durationMins / 60).toFixed(1)}h sleep`,
        detail: `Quality ${night.quality}/5`,
        badge: "Sleep",
      }),
    );
  });

  entries.sort((a, b) => b.ts - a.ts);
  return entries.slice(0, limit);
}

function getLatestMood(state: JarvisState): MoodLog | undefined {
  const all = Object.values(state.mood).flat();
  return all.sort((a, b) => b.ts - a.ts)[0];
}

function calculateStreak(state: JarvisState, windowDays = 30): number {
  let streak = 0;
  for (let offset = 0; offset < windowDays; offset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = getDayKey(date);
    const hasMood = (state.mood[key]?.length ?? 0) > 0;
    const hasJournal = (state.journal[key]?.length ?? 0) > 0;
    const hasTodoDone = state.todos[key]?.some((todo) => todo.done) ?? false;
    if (hasMood && hasJournal && hasTodoDone) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function buildSuggestions(args: {
  hasMood: boolean;
  hasJournal: boolean;
  hasTodoDone: boolean;
}): string[] {
  const tips: string[] = [];
  if (!args.hasMood) tips.push("Log your mood to keep the streak alive.");
  if (!args.hasJournal) tips.push("Drop a 2-minute journal entry to clear the head.");
  if (!args.hasTodoDone) tips.push("Check off one priority task for the day.");
  if (tips.length < 3) tips.push("Timeblock one todo with a 30m focus block.");
  return tips.slice(0, 3);
}

function TimelinePanel({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">Timeline</h2>
        <span className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
          blended feed
        </span>
      </div>
      <div className="mt-6 space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No entries yet. Log moods, journal, or schedule todos to see them
            appear here.
          </p>
        ) : (
          entries.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
            >
              <div>
                <p className="font-medium text-white">{item.title}</p>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">
                  {item.detail}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                {item.badge}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type TodosPanelProps = {
  todos: TodoItem[];
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  todoText: string;
  setTodoText: (value: string) => void;
  todoPriority: TodoPriority;
  setTodoPriority: (value: TodoPriority) => void;
  todoTimeblock?: Timeblock;
  setTodoTimeblock: (value: Timeblock | undefined) => void;
  toggleTodo: (id: string) => void;
  updatePriority: (id: string, priority: TodoPriority) => void;
  status: "idle" | "saved";
};

function TodosPanel(props: TodosPanelProps) {
  const completedCount = props.todos.filter((todo) => todo.done).length;
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:col-span-2">
      <h2 className="text-lg font-medium text-white">Today&apos;s Todos</h2>
      <p className="mt-1 text-sm text-zinc-300">
        {props.todos.length
          ? `${completedCount}/${props.todos.length} completed.`
          : "No tasks yet — add your top three."}
      </p>
      <form className="mt-4 flex flex-col gap-4" onSubmit={props.onSubmit}>
        <input
          className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
          placeholder="Add a todo and press enter"
          value={props.todoText}
          onChange={(event) => props.setTodoText(event.target.value)}
        />
        <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.3em] text-zinc-400">
          <div>
            <p>Priority</p>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3].map((priority) => {
                const active = props.todoPriority === priority;
                return (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => props.setTodoPriority(priority as TodoPriority)}
                    className={`rounded-full px-3 py-1 font-semibold transition ${active ? "bg-amber-300 text-zinc-900" : "bg-white/10 text-zinc-200"}`}
                  >
                    P{priority}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p>Timeblock</p>
            <select
              className="mt-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.3em] text-zinc-200"
              value={props.todoTimeblock ? props.todoTimeblock.toString() : ""}
              onChange={(event) =>
                props.setTodoTimeblock(
                  event.target.value === ""
                    ? undefined
                    : (Number(event.target.value) as Timeblock),
                )
              }
            >
              <option value="">none</option>
              {timeblockOptions.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}m
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
        >
          Add todo
        </button>
        {props.status === "saved" && (
          <p className="text-sm text-emerald-300">Queued up.</p>
        )}
      </form>

      <div className="mt-6 space-y-3">
        {props.todos.length === 0 ? (
          <p className="text-sm text-zinc-400">No tasks yet. Add your top 3.</p>
        ) : (
          props.todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
            >
              <label className="flex flex-1 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 cursor-pointer accent-cyan-300"
                  checked={todo.done}
                  onChange={() => props.toggleTodo(todo.id)}
                />
                <div>
                  <p className={`text-sm font-medium ${todo.done ? "text-zinc-400 line-through" : "text-white"}`}>
                    {todo.text}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                    P{todo.priority}
                    {todo.timeblockMins ? ` • ${todo.timeblockMins}m block` : ""}
                    {todo.done && todo.completedTs
                      ? ` • done at ${new Date(todo.completedTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </p>
                </div>
              </label>
              <button
                type="button"
                onClick={() => props.updatePriority(todo.id, nextPriority(todo.priority))}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-zinc-200"
              >
                P{todo.priority}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type JournalPanelProps = {
  journalText: string;
  setJournalText: (value: string) => void;
  prompt?: JournalPrompt;
  onPromptSelect: (value: JournalPrompt) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  status: "idle" | "saved";
};

function JournalPanel(props: JournalPanelProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <h2 className="text-lg font-medium text-white">Quick Journal</h2>
      <p className="mt-1 text-sm text-zinc-300">
        One paragraph. Clarity &gt; volume.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(journalPromptCopy) as JournalPrompt[]).map((prompt) => {
          const active = props.prompt === prompt;
          return (
            <button
              key={prompt}
              type="button"
              onClick={() => props.onPromptSelect(prompt)}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] transition ${active ? "bg-pink-300 text-zinc-900" : "bg-white/10 text-zinc-200"}`}
            >
              {prompt}
            </button>
          );
        })}
      </div>
      <form className="mt-4 flex flex-col gap-4" onSubmit={props.onSubmit}>
        <textarea
          value={props.journalText}
          onChange={(event) => props.setJournalText(event.target.value)}
          rows={6}
          className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
          placeholder="What&apos;s the plan? What has your attention?"
        />
        <button
          type="submit"
          className="rounded-2xl bg-gradient-to-r from-fuchsia-400 to-purple-500 px-4 py-3 text-sm font-semibold text-white"
        >
          Save entry
        </button>
        {props.status === "saved" && (
          <p className="text-sm text-emerald-300">Saved.</p>
        )}
      </form>
    </div>
  );
}

function nextPriority(value: TodoPriority): TodoPriority {
  if (value === 3) return 1;
  return ((value + 1) as TodoPriority);
}
