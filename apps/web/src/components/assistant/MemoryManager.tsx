"use client";
import { useCallback, useEffect, useState } from "react";

type SavedMemory = {
  id: string;
  key: string;
  value: string;
  domain: string;
  type: string;
  assertion: string;
  extractionMethod: string;
  status: string;
  conflict: boolean;
  sources: {
    sourceType: string;
    sourceId: string;
    sourceAt: string;
    reliability: string;
  }[];
};
export function MemoryManager({
  domain,
  project,
  onClose,
}: {
  domain: string;
  project: string;
  onClose: () => void;
}) {
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(false),
    [conflicts, setConflicts] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SavedMemory | null>(null);
  const [title, setTitle] = useState(""),
    [content, setContent] = useState("");
  const [scope, setScope] = useState(domain);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [source, setSource] = useState<{ id: string; content: string } | null>(
    null,
  );
  const load = useCallback(
    async (after?: string, signal?: AbortSignal) => {
      const params = new URLSearchParams({
        domain,
        project,
        q: query,
        history: String(history),
        conflicts: String(conflicts),
        ...(after ? { after } : {}),
      });
      const response = await fetch(`/api/assistant/memory?${params}`, {
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not load saved memories.");
      if (signal?.aborted) return;
      setMemories((old) =>
        after ? [...old, ...data.memories] : data.memories,
      );
      setCursor(data.nextCursor);
      setError("");
    },
    [domain, project, query, history, conflicts],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(undefined, controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);
  const mutate = async (method: string, body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assistant/memory", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not change this memory.");
      setEditing(null);
      setTitle("");
      setContent("");
      setDeleting(null);
      setSource(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const inspect = async (type: string, id: string) => {
    try {
      const response = await fetch(
        `/api/assistant/memory/source?${new URLSearchParams({ type, id })}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSource({ id, content: data.content });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Source unavailable.");
    }
  };
  const field =
    "w-full rounded-xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white";
  return (
    <aside
      aria-label="Saved memories"
      className="theme-workspace flex h-full min-h-0 min-w-0 flex-col rounded-3xl border p-4 text-white"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Saved memories</h2>
        <button className="min-h-11 px-3" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-400">
        Evidence Jarvis can recall. Correcting a memory preserves its history.
        Deleting a saved memory keeps its original conversation or application
        record.
      </p>
      <label className="text-sm">
        Search
        <input
          className={field}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
          placeholder="Search this project and shared memories"
        />
      </label>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={conflicts}
            onChange={(e) => setConflicts(e.target.checked)}
          />
          Needs review
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
          />
          Include earlier versions
        </label>
      </div>
      {error && (
        <p role="alert" className="py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {!memories.length && (
          <p className="py-5 text-sm text-zinc-400">
            No matching saved memories.
          </p>
        )}
        {memories.map((m) => (
          <article key={m.id} className="rounded-xl border border-white/10 p-3">
            <h3 className="break-words text-sm font-semibold">{m.key}</h3>
            <p className="mt-1 text-xs text-zinc-400">
              {(
                {
                  semantic: "Fact",
                  episodic: "Event",
                  working: "Temporary context",
                  procedural: "Procedure",
                  reference: "Record reference",
                } as Record<string, string>
              )[m.type] ?? m.type}{" "}
              · {m.domain} ·{" "}
              {m.status === "superseded"
                ? "Earlier version"
                : m.extractionMethod === "user-confirmed"
                  ? "You confirmed this"
                  : m.assertion === "user_stated"
                    ? "From your words"
                    : "Unverified summary"}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
              {m.value}
            </p>
            {m.conflict && (
              <p className="mt-2 text-xs text-amber-200">
                Another saved statement differs. Review and correct the current
                fact.
              </p>
            )}
            <details className="mt-2 text-xs">
              <summary className="min-h-11 cursor-pointer py-3">
                Why this was saved
              </summary>
              <p>
                {m.extractionMethod === "rules-v2"
                  ? "You stated a preference, goal, decision, or outcome."
                  : m.extractionMethod === "legacy-import-v2"
                    ? "Imported from earlier saved memory; generated summaries remain unverified."
                    : "Saved or corrected by you."}
              </p>
              {m.sources.map((s) => (
                <div
                  key={`${s.sourceType}:${s.sourceId}`}
                  className="break-all py-1"
                >
                  {new Date(s.sourceAt).toLocaleDateString()} ·{" "}
                  {s.sourceType === "manual" ? (
                    "Saved by you"
                  ) : (
                    <button
                      className="min-h-11 text-cyan-200 underline"
                      onClick={() => void inspect(s.sourceType, s.sourceId)}
                    >
                      Read source
                    </button>
                  )}
                  <span className="block text-zinc-500">{s.sourceId}</span>
                  {source?.id === s.sourceId && (
                    <blockquote className="mt-2 border-l border-white/20 pl-2 whitespace-pre-wrap">
                      {source.content}
                    </blockquote>
                  )}
                </div>
              ))}
            </details>
            <div className="flex gap-3">
              {m.status === "active" && (
                <button
                  disabled={busy}
                  className="min-h-11 text-sm text-cyan-200"
                  onClick={() => {
                    setEditing(m);
                    setTitle(m.key);
                    setContent(m.value);
                    setScope(m.domain);
                  }}
                >
                  Correct
                </button>
              )}
              <button
                disabled={busy}
                className="min-h-11 text-sm text-rose-200"
                onClick={() => setDeleting(m.id)}
              >
                Delete saved memory
              </button>
            </div>
            {deleting === m.id && (
              <div className="text-xs">
                <p>
                  Delete this saved memory? Its source stays available in
                  Jarvis.
                </p>
                <button
                  disabled={busy}
                  className="min-h-11 pr-4 text-rose-200"
                  onClick={() => void mutate("DELETE", { id: m.id })}
                >
                  Confirm delete
                </button>
                <button className="min-h-11" onClick={() => setDeleting(null)}>
                  Cancel
                </button>
              </div>
            )}
          </article>
        ))}
        {cursor && (
          <button
            className="min-h-11 text-sm text-cyan-200"
            onClick={() => void load(cursor).catch((e) => setError(e.message))}
          >
            Load more
          </button>
        )}
      </div>
      <form
        className="mt-3 space-y-2 border-t border-white/10 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate(editing ? "PATCH" : "POST", {
            id: editing?.id,
            key: title,
            value: content,
            domain: scope,
          });
        }}
      >
        <p className="text-sm font-semibold">
          {editing ? "Correct saved memory" : "Save a memory"}
        </p>
        <label className="block text-xs">
          Scope
          <select
            className={field}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={Boolean(editing)}
          >
            {[...new Set(["general", project, domain])].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          Title
          <input
            className={field}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className="block text-xs">
          What should Jarvis remember?
          <textarea
            className={field}
            rows={2}
            maxLength={4000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </label>
        <button
          className="min-h-11 rounded-xl bg-cyan-200 px-4 text-sm font-semibold text-black disabled:opacity-50"
          disabled={busy || !title.trim() || !content.trim()}
        >
          {busy ? "Saving…" : editing ? "Save correction" : "Save memory"}
        </button>
        {editing && (
          <button
            type="button"
            className="min-h-11 px-3 text-sm"
            onClick={() => {
              setEditing(null);
              setTitle("");
              setContent("");
            }}
          >
            Cancel
          </button>
        )}
      </form>
    </aside>
  );
}
