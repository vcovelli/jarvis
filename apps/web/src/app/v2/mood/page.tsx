"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { getDayKey, type DayKey, type MoodLog, type MoodTag, useJarvisState } from "@/lib/jarvisStore";
import { useToast } from "@/components/Toast";

type MoodPreset = {
  label: string;
  value: number;
  note?: string;
};

type MoodTrendDay = {
  key: DayKey;
  label: string;
  average: number | null;
  count: number;
};

const moodPresets: MoodPreset[] = [
  { label: "Steady", value: 7 },
  { label: "Locked", value: 8 },
  { label: "Scattered", value: 4, note: "Scattered, needs a cleaner next action." },
  { label: "Low battery", value: 3 },
];

export default function MoodPage() {
  const {
    state,
    hydrated,
    logMood,
    updateMood,
    deleteMood,
    addMoodTag,
    renameMoodTag,
    deleteMoodTag,
  } = useJarvisState();
  const { showToast } = useToast();
  const todayKey = getDayKey();
  const todaysMood = useMemo(() => [...(state.mood[todayKey] ?? [])].sort((a, b) => b.ts - a.ts), [state.mood, todayKey]);
  const moodTagOptions = useMemo(() => buildMoodTagOptions(state.moodTags ?? []), [state.moodTags]);
  const trend = useMemo(() => buildMoodTrend(state.mood), [state.mood]);
  const [moodValue, setMoodValue] = useState(5);
  const [note, setNote] = useState("");
  const [selectedTags, setSelectedTags] = useState<MoodTag[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [editing, setEditing] = useState<MoodLog | null>(null);
  const [pendingMoodDeleteId, setPendingMoodDeleteId] = useState<string | null>(null);
  const [editMoodValue, setEditMoodValue] = useState(5);
  const [editNote, setEditNote] = useState("");
  const [editTags, setEditTags] = useState<MoodTag[]>([]);
  const latestMood = todaysMood[0];
  const todayAverage = todaysMood.length
    ? Math.round((todaysMood.reduce((total, entry) => total + entry.mood, 0) / todaysMood.length) * 10) / 10
    : null;
  const tone = getMoodTone(moodValue);
  const editTone = getMoodTone(editMoodValue);
  const suggestedHref = latestMood && latestMood.mood <= 4 ? "/v2/sleep" : latestMood && latestMood.mood >= 7 ? "/v2/must-win" : "/v2/daily?mode=backlog";
  const suggestedLabel = latestMood && latestMood.mood <= 4 ? "Protect recovery" : latestMood && latestMood.mood >= 7 ? "Aim it at a win" : "Clear the scatter";

  if (!hydrated) {
    return <p className="theme-muted text-sm uppercase tracking-[0.3em]">Loading mood...</p>;
  }

  function toggleTag(tag: MoodTag) {
    setSelectedTags((current) => toggleArrayValue(current, tag));
  }

  function toggleEditTag(tag: MoodTag) {
    setEditTags((current) => toggleArrayValue(current, tag));
  }

  function buildTags() {
    const trimmed = normalizeTagInput(customTag);
    const tags = trimmed && !selectedTags.includes(trimmed) ? [...selectedTags, trimmed] : selectedTags;
    if (trimmed) addMoodTag({ tag: trimmed });
    return tags;
  }

  function addManagedTag(value: string) {
    const tag = normalizeTagInput(value);
    if (!tag) return false;
    if (moodTagOptions.some((option) => option.toLowerCase() === tag.toLowerCase())) {
      showToast("That mood tag already exists");
      return false;
    }
    if ((state.moodTags ?? []).length >= 24) {
      showToast("Mood tag library is full");
      return false;
    }
    addMoodTag({ tag });
    showToast("Mood tag added");
    return true;
  }

  function renameManagedTag(from: string, value: string) {
    const tag = normalizeTagInput(value);
    if (!tag) return false;
    if (
      moodTagOptions.some(
        (option) => option.toLowerCase() === tag.toLowerCase() && option.toLowerCase() !== from.toLowerCase(),
      )
    ) {
      showToast("That mood tag already exists");
      return false;
    }
    renameMoodTag({ from, to: tag });
    setSelectedTags((current) => replaceArrayTag(current, from, tag));
    setEditTags((current) => replaceArrayTag(current, from, tag));
    showToast("Mood tag renamed");
    return true;
  }

  function removeManagedTag(tag: string) {
    deleteMoodTag({ tag });
    setSelectedTags((current) => current.filter((value) => value.toLowerCase() !== tag.toLowerCase()));
    setEditTags((current) => current.filter((value) => value.toLowerCase() !== tag.toLowerCase()));
    showToast("Mood tag removed");
  }

  function submitMood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    logMood({ mood: moodValue, note: note.trim() || undefined, tags: buildTags() });
    setMoodValue(5);
    setNote("");
    setSelectedTags([]);
    setCustomTag("");
    showToast("Mood logged");
  }

  function logPreset(preset: MoodPreset) {
    logMood({ mood: preset.value, note: preset.note, tags: [] });
    showToast(preset.label + " mood logged");
  }

  function startEdit(entry: MoodLog) {
    setEditing(entry);
    setPendingMoodDeleteId(null);
    setEditMoodValue(entry.mood);
    setEditNote(entry.note ?? "");
    setEditTags(entry.tags ?? []);
  }

  function saveEdit() {
    if (!editing) return;
    updateMood({
      day: todayKey,
      id: editing.id,
      updates: {
        mood: editMoodValue,
        note: editNote.trim() || undefined,
        tags: editTags,
      },
    });
    setEditing(null);
    showToast("Mood updated");
  }

  function removeEntry(entry: MoodLog) {
    deleteMood({ day: todayKey, id: entry.id });
    setEditing(null);
    setPendingMoodDeleteId(null);
    showToast("Mood deleted");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-6">
      <header className="mobile-compact-header flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="theme-kicker text-xs uppercase tracking-[0.35em]">Quick jump</p>
          <h1 className="theme-text mt-2 text-3xl font-semibold">Mood check-in</h1>
          <p className="theme-muted mt-2 max-w-xl text-sm leading-6">Log the signal fast, then let the rest of the system respond.</p>
        </div>
        <Link href="/v2" className="theme-button-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em]">
          Remote
        </Link>
      </header>

      <section className="theme-surface rounded-[28px] p-5">
        <form className="flex flex-col gap-4" onSubmit={submitMood}>
          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center">
            <div className="theme-card rounded-3xl p-5 text-center">
              <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">Right now</p>
              <p className={"mt-3 text-6xl font-semibold " + tone.text}>{moodValue}</p>
              <p className="theme-muted mt-1 text-sm">{tone.label}</p>
            </div>
            <div className="grid gap-4">
              <input
                data-guide="mood-score"
                aria-label="Mood score"
                type="range"
                min={1}
                max={10}
                value={moodValue}
                onChange={(event) => setMoodValue(Number(event.target.value))}
                className="h-3 w-full cursor-pointer appearance-none rounded bg-transparent"
                style={{ accentColor: tone.accent, background: buildSliderBackground(tone.accent, moodValue) }}
              />
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.24em]">Mood tags</p>
                  <button
                    type="button"
                    onClick={() => setTagManagerOpen((current) => !current)}
                    className="theme-button-secondary rounded-full px-3 py-1.5 text-xs font-semibold"
                    aria-expanded={tagManagerOpen}
                  >
                    {tagManagerOpen ? "Done" : "Manage tags"}
                  </button>
                </div>
                <TagGrid tags={moodTagOptions} selectedTags={selectedTags} onToggle={toggleTag} />
                {tagManagerOpen && (
                  <MoodTagManager
                    customTags={state.moodTags ?? []}
                    onAdd={addManagedTag}
                    onRename={renameManagedTag}
                    onDelete={removeManagedTag}
                  />
                )}
              </div>
              <button type="submit" className="theme-button-primary rounded-2xl px-4 py-3 text-sm font-semibold">
                Log mood
              </button>
            </div>
          </div>
          <details className="theme-card rounded-2xl p-3">
            <summary data-guide="mood-context" className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.2em] theme-muted">Add context</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]">
              <input
                value={customTag}
                onChange={(event) => setCustomTag(event.target.value)}
                className="theme-input min-w-0 rounded-2xl px-4 py-3 text-base focus:outline-none"
                placeholder="Custom tag"
              />
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                className="theme-input min-w-0 rounded-2xl px-4 py-3 text-base focus:outline-none"
                placeholder="What is shaping this mood?"
              />
            </div>
          </details>
        </form>
      </section>

      <section className="hidden gap-4 md:grid md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="theme-surface rounded-[28px] p-5">
          <div className="grid grid-cols-3 gap-3">
            <MoodMetric label="Latest" value={latestMood ? String(latestMood.mood) + "/10" : "--"} detail={latestMood ? getMoodTone(latestMood.mood).label : "No signal"} />
            <MoodMetric label="Average" value={todayAverage !== null ? String(todayAverage) : "--"} detail={todaysMood.length ? String(todaysMood.length) + " checks" : "Today"} />
            <MoodMetric label="Next" value={suggestedLabel} detail="Jump" href={suggestedHref} />
          </div>
          <div className="theme-card mt-4 rounded-2xl p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="theme-kicker text-[10px] uppercase tracking-[0.3em]">Seven day signal</p>
                <p className="theme-muted mt-1 text-xs">Tap mood once, trend later.</p>
              </div>
              <span className="theme-pill rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]">
                {trend.filter((day) => day.count > 0).length}/7 days
              </span>
            </div>
            <div className="mt-4 grid h-20 grid-cols-7 items-end gap-2">
              {trend.map((day) => (
                <div key={day.key} className="flex h-full flex-col items-center justify-end gap-2">
                  <div className="w-full rounded-full bg-white/10" style={{ height: day.average ? String(Math.max(16, day.average * 8)) + "%" : "8%", backgroundColor: day.average ? getMoodTone(day.average).accent : undefined }} />
                  <span className="theme-muted text-[10px] font-semibold uppercase">{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="theme-surface rounded-[28px] p-5">
          <p className="theme-kicker text-[10px] uppercase tracking-[0.3em]">Quick states</p>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-1">
            {moodPresets.map((preset) => (
              <button key={preset.label} type="button" onClick={() => logPreset(preset)} className="theme-button-secondary rounded-2xl px-4 py-3 text-left">
                <span className="theme-text block text-sm font-semibold">{preset.label}</span>
                <span className="theme-muted mt-1 block text-xs">{preset.value}/10</span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="theme-surface rounded-[28px] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="theme-kicker text-[10px] uppercase tracking-[0.3em]">Today</p>
            <h2 data-guide="mood-history" className="theme-text mt-1 text-lg font-semibold">Mood log</h2>
          </div>
          <span className="theme-pill rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]">{todaysMood.length} entries</span>
        </div>
        <div className="mt-4 space-y-3">
          {todaysMood.length ? todaysMood.map((entry) => {
            const entryTone = getMoodTone(entry.mood);
            const isEditing = editing?.id === entry.id;
            return (
              <div key={entry.id} className="theme-card rounded-2xl p-4">
                {isEditing ? (
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="theme-text text-sm font-semibold">Edit check-in</p>
                      <p className={"text-2xl font-semibold " + editTone.text}>{editMoodValue}/10</p>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={editMoodValue}
                      onChange={(event) => setEditMoodValue(Number(event.target.value))}
                      className="h-3 w-full cursor-pointer appearance-none rounded bg-transparent"
                      style={{ accentColor: editTone.accent, background: buildSliderBackground(editTone.accent, editMoodValue) }}
                    />
                    <TagGrid tags={moodTagOptions} selectedTags={editTags} onToggle={toggleEditTag} />
                    <textarea
                      value={editNote}
                      onChange={(event) => setEditNote(event.target.value)}
                      rows={3}
                      className="theme-input min-w-0 rounded-2xl px-4 py-3 text-base focus:outline-none"
                      placeholder="Update note"
                    />
                    {pendingMoodDeleteId === entry.id ? (
                      <div className="theme-card flex flex-wrap items-center gap-2 rounded-xl p-2">
                        <p className="theme-muted min-w-0 flex-1 text-xs">Delete this mood permanently?</p>
                        <button type="button" onClick={() => removeEntry(entry)} className="rounded-lg bg-rose-400 px-3 py-2 text-xs font-semibold text-rose-950">
                          Yes, delete
                        </button>
                        <button type="button" onClick={() => setPendingMoodDeleteId(null)} className="theme-button-secondary rounded-lg px-3 py-2 text-xs font-semibold">
                          Keep it
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={saveEdit} className="theme-button-primary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">Save</button>
                        <button type="button" onClick={() => setEditing(null)} className="theme-button-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">Cancel</button>
                        <button type="button" onClick={() => setPendingMoodDeleteId(entry.id)} className="rounded-xl border border-rose-300/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">Delete</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={"text-2xl font-semibold " + entryTone.text}>{entry.mood}/10</p>
                        <p className="theme-muted mt-1 text-xs uppercase tracking-[0.22em]">{formatTime(entry.ts)} - {entryTone.label}</p>
                      </div>
                      <button type="button" onClick={() => startEdit(entry)} className="theme-button-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]">Edit</button>
                    </div>
                    {entry.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.tags.map((tag) => (
                          <span key={tag} className="theme-chip inline-flex max-w-full rounded-full px-3 py-1.5 text-xs font-semibold">
                            <span className="break-words text-center leading-tight">{tag}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {entry.note && <p className="theme-muted mt-2 text-sm leading-6">{entry.note}</p>}
                  </div>
                )}
              </div>
            );
          }) : <p className="theme-card rounded-2xl border-dashed px-4 py-5 text-center text-sm theme-muted">No mood logged yet today.</p>}
        </div>
      </section>
    </div>
  );
}

function MoodMetric({ label, value, detail, href }: { label: string; value: string; detail: string; href?: string }) {
  const content = (
    <>
      <p className="theme-muted text-[10px] uppercase tracking-[0.25em]">{label}</p>
      <p className="theme-text mt-2 text-xl font-semibold leading-tight">{value}</p>
      <p className="theme-muted mt-1 text-xs">{detail}</p>
    </>
  );
  if (href) {
    return <Link href={href} className="theme-card rounded-2xl p-4 transition hover:-translate-y-0.5">{content}</Link>;
  }
  return <div className="theme-card rounded-2xl p-4">{content}</div>;
}

function TagGrid({ tags, selectedTags, onToggle }: { tags: MoodTag[]; selectedTags: MoodTag[]; onToggle: (tag: MoodTag) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Mood tags">
      {tags.map((tag) => {
        const active = selectedTags.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            className={"theme-chip inline-flex max-w-full flex-none items-center justify-center rounded-full px-3 py-2 text-xs font-semibold " + (active ? "is-active" : "")}
          >
            <span className="whitespace-normal break-words text-center leading-tight">{tag}</span>
          </button>
        );
      })}
    </div>
  );
}

function MoodTagManager({
  customTags,
  onAdd,
  onRename,
  onDelete,
}: {
  customTags: MoodTag[];
  onAdd: (tag: string) => boolean;
  onRename: (from: string, to: string) => boolean;
  onDelete: (tag: string) => void;
}) {
  const [newTag, setNewTag] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deletingTag, setDeletingTag] = useState<string | null>(null);

  function addTag() {
    if (onAdd(newTag)) setNewTag("");
  }

  function beginRename(tag: string) {
    setDeletingTag(null);
    setEditingTag(tag);
    setEditingValue(tag);
  }

  function saveRename() {
    if (!editingTag) return;
    if (onRename(editingTag, editingValue)) {
      setEditingTag(null);
      setEditingValue("");
    }
  }

  return (
    <div className="theme-card rounded-2xl p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="theme-text text-sm font-semibold">Tag library</p>
          <p className="theme-muted mt-1 text-xs leading-5">Add, rename, or remove your mood tags.</p>
        </div>
        <span className="theme-pill rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
          {customTags.length}/24 custom
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={newTag}
          onChange={(event) => setNewTag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          maxLength={24}
          className="theme-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm focus:outline-none"
          placeholder="Add a reusable tag"
        />
        <button type="button" onClick={addTag} className="theme-button-primary rounded-xl px-4 py-2 text-xs font-semibold">
          Add tag
        </button>
      </div>

      {customTags.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {customTags.map((tag) => (
            <div key={tag} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2">
              {editingTag === tag ? (
                <>
                  <input
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveRename();
                      }
                      if (event.key === "Escape") setEditingTag(null);
                    }}
                    maxLength={24}
                    className="theme-input min-w-40 flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                    aria-label={`Rename ${tag}`}
                    autoFocus
                  />
                  <button type="button" onClick={saveRename} className="theme-button-primary rounded-lg px-3 py-2 text-xs font-semibold">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingTag(null)} className="theme-button-secondary rounded-lg px-3 py-2 text-xs font-semibold">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="theme-chip inline-flex max-w-full rounded-full px-3 py-1.5 text-xs font-semibold">
                    <span className="break-words leading-tight">{tag}</span>
                  </span>
                  <span className="min-w-0 flex-1" />
                  {deletingTag === tag ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(tag);
                          setDeletingTag(null);
                        }}
                        className="rounded-lg bg-rose-400 px-3 py-2 text-xs font-semibold text-rose-950"
                      >
                        Confirm
                      </button>
                      <button type="button" onClick={() => setDeletingTag(null)} className="theme-button-secondary rounded-lg px-3 py-2 text-xs font-semibold">
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => beginRename(tag)} className="theme-button-secondary rounded-lg px-3 py-2 text-xs font-semibold">
                        Edit
                      </button>
                      <button type="button" onClick={() => setDeletingTag(tag)} className="rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-semibold text-rose-200">
                        Remove
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="theme-muted mt-3 text-xs">No custom tags yet.</p>
      )}
    </div>
  );
}

function buildMoodTagOptions(customTags: string[]) {
  const seen = new Set<string>();
  return customTags.filter((tag) => {
    const normalized = tag.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function buildMoodTrend(mood: Record<DayKey, MoodLog[]>): MoodTrendDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = getDayKey(date);
    const logs = mood[key] ?? [];
    const average = logs.length ? Math.round((logs.reduce((total, entry) => total + entry.mood, 0) / logs.length) * 10) / 10 : null;
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 1),
      average,
      count: logs.length,
    };
  });
}

function toggleArrayValue<T>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function normalizeTagInput(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 24);
}

function replaceArrayTag(values: MoodTag[], from: string, to: string) {
  return values.map((tag) => (tag.toLowerCase() === from.toLowerCase() ? to : tag));
}

function buildSliderBackground(accent: string, value: number) {
  const percent = ((value - 1) / 9) * 100;
  return "linear-gradient(90deg, " + accent + " 0%, " + accent + " " + percent + "%, #3f3f46 " + percent + "%, #3f3f46 100%)";
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function getMoodTone(value: number) {
  if (value <= 3) return { text: "text-rose-300", accent: "#f87171", label: "Heavy" };
  if (value <= 5) return { text: "text-amber-300", accent: "#fbbf24", label: "Uneven" };
  if (value <= 7) return { text: "text-lime-300", accent: "#84cc16", label: "Steady" };
  return { text: "text-emerald-300", accent: "#34d399", label: "Charged" };
}
