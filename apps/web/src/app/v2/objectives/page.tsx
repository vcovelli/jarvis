"use client";

import { FormEvent, useMemo, useState } from "react";

import { Objective, ObjectiveStatus, useJarvisState } from "@/lib/jarvisStore";

const statusOptions: Array<{ id: ObjectiveStatus; label: string }> = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "done", label: "Done" },
];

export default function ObjectivesPage() {
  const {
    state,
    hydrated,
    addObjective,
    updateObjective,
    deleteObjective,
    addObjectiveProject,
    toggleObjectiveProject,
  } = useJarvisState();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [target, setTarget] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [projectText, setProjectText] = useState<Record<string, string>>({});
  const [milestoneText, setMilestoneText] = useState<Record<string, string>>({});

  const activeObjectives = useMemo(
    () =>
      [...state.objectives].sort((left, right) => {
        const statusRank = statusWeight(left.status) - statusWeight(right.status);
        return statusRank || right.updatedTs - left.updatedTs;
      }),
    [state.objectives],
  );
  const atRiskCount = activeObjectives.filter((objective) => {
    const progress = getObjectiveProgress(objective);
    return objective.status === "active" && progress.total > 0 && progress.percent < 35;
  }).length;

  function handleAddObjective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    addObjective({
      title: trimmedTitle,
      area,
      target,
      nextAction,
    });
    setTitle("");
    setArea("");
    setTarget("");
    setNextAction("");
  }

  function handleAddProject(objectiveId: string) {
    const trimmedTitle = projectText[objectiveId]?.trim();
    if (!trimmedTitle) return;
    addObjectiveProject({
      objectiveId,
      title: trimmedTitle,
      milestone: milestoneText[objectiveId],
    });
    setProjectText((current) => ({ ...current, [objectiveId]: "" }));
    setMilestoneText((current) => ({ ...current, [objectiveId]: "" }));
  }

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading objectives...</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Objectives</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Outcome map</h1>
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-300">
          Objectives connect projects, milestones, and daily actions without turning the planner into another backlog.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Current state</p>
          <p className="mt-4 text-4xl font-semibold text-white">{activeObjectives.length}</p>
          <p className="mt-2 text-sm text-zinc-300">Tracked objectives.</p>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Recommended action</p>
          <p className="mt-4 text-lg font-semibold text-cyan-100">
            {activeObjectives[0]?.nextAction || "Create one active objective with a clear next action."}
          </p>
        </div>
        <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Historical trend</p>
          <p className="mt-4 text-4xl font-semibold text-amber-200">{atRiskCount}</p>
          <p className="mt-2 text-sm text-zinc-300">Active objectives below 35% project completion.</p>
        </div>
      </section>

      <form
        onSubmit={handleAddObjective}
        className="glass-panel grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:grid-cols-2"
      >
        <div className="lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">New objective</p>
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Objective, e.g. Become excellent in manufacturing IT"
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 lg:col-span-2"
        />
        <input
          value={area}
          onChange={(event) => setArea(event.target.value)}
          placeholder="Area, e.g. Career"
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
        />
        <input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="Target, e.g. Build enterprise support skills"
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
        />
        <input
          value={nextAction}
          onChange={(event) => setNextAction(event.target.value)}
          placeholder="Next action"
          className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 lg:col-span-2"
        />
        <button
          type="submit"
          className="rounded-full bg-cyan-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-950 lg:col-span-2"
        >
          Add objective
        </button>
      </form>

      <section className="grid gap-6">
        {activeObjectives.length === 0 ? (
          <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300 backdrop-blur-lg">
            No objectives yet. Start with one outcome and one next action.
          </div>
        ) : (
          activeObjectives.map((objective) => {
            const progress = getObjectiveProgress(objective);
            return (
              <article
                key={objective.id}
                className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {objective.area && (
                        <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100">
                          {objective.area}
                        </span>
                      )}
                      <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-300">
                        {objective.status}
                      </span>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-white">{objective.title}</h2>
                    {objective.target && (
                      <p className="mt-2 text-sm leading-6 text-zinc-300">{objective.target}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={objective.status}
                      onChange={(event) =>
                        updateObjective({
                          id: objective.id,
                          updates: { status: event.target.value as ObjectiveStatus },
                        })
                      }
                      className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
                    >
                      {statusOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Delete this objective?")) {
                          deleteObjective({ id: objective.id });
                        }
                      }}
                      className="rounded-full border border-rose-300/30 px-3 py-2 text-xs font-semibold text-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.25em] text-zinc-400">
                    <span>Progress</span>
                    <span>{progress.done}/{progress.total} projects</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>

                {objective.nextAction && (
                  <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    Next action: {objective.nextAction}
                  </div>
                )}

                <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                  <div className="space-y-3">
                    {objective.projects.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-400">
                        Add projects or milestones to make progress visible.
                      </p>
                    ) : (
                      objective.projects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() =>
                            toggleObjectiveProject({
                              objectiveId: objective.id,
                              projectId: project.id,
                            })
                          }
                          className="flex w-full items-start justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-left"
                        >
                          <span>
                            <span className="block text-sm font-semibold text-white">{project.title}</span>
                            {project.milestone && (
                              <span className="mt-1 block text-xs uppercase tracking-[0.2em] text-zinc-400">
                                {project.milestone}
                              </span>
                            )}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                              project.done
                                ? "bg-emerald-300 text-emerald-950"
                                : "bg-white/10 text-zinc-300"
                            }`}
                          >
                            {project.done ? "Done" : "Open"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-zinc-400">Add project</p>
                    <input
                      value={projectText[objective.id] ?? ""}
                      onChange={(event) =>
                        setProjectText((current) => ({
                          ...current,
                          [objective.id]: event.target.value,
                        }))
                      }
                      placeholder="Project or milestone"
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    />
                    <input
                      value={milestoneText[objective.id] ?? ""}
                      onChange={(event) =>
                        setMilestoneText((current) => ({
                          ...current,
                          [objective.id]: event.target.value,
                        }))
                      }
                      placeholder="Optional milestone"
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddProject(objective.id)}
                      className="mt-3 w-full rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-950"
                    >
                      Add project
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function getObjectiveProgress(objective: Objective) {
  const total = objective.projects.length;
  const done = objective.projects.filter((project) => project.done).length;
  return {
    total,
    done,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function statusWeight(status: ObjectiveStatus) {
  if (status === "active") return 0;
  if (status === "paused") return 1;
  return 2;
}
