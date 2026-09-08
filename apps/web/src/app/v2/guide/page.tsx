"use client";

import { useState } from "react";
import { useWalkthrough } from "@/components/onboarding/WalkthroughProvider";
import { userGuides, type GuideCategory } from "@/lib/userGuides";

const categories: GuideCategory[] = ["Start here", "Daily routine", "Tools and projects", "Your workspace"];

export default function UserGuidePage() {
  const { ready, progress, demoMode, storageAvailable, start, startDemo, setNeverPrompt } = useWalkthrough();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const completed = userGuides.filter((guide) => progress.guides[guide.id]?.status === "completed").length;
  const visible = userGuides.filter((guide) => {
    const status = progress.guides[guide.id]?.status;
    const matchesFilter = filter === "all" || (filter === "resume" && (status === "skipped" || status === "in-progress")) || (filter === "dismissed" && (status === "dismissed" || progress.guides[guide.id]?.neverSuggest));
    return matchesFilter && (guide.title + " " + guide.description + " " + guide.category).toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-4">
      <header className="theme-surface rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="theme-kicker text-xs font-semibold">Learn Jarvis</p>
          <span className="theme-pill rounded-full px-3 py-2 text-xs">{demoMode ? "Demo guide progress" : "Your guide progress"} · {completed}/{userGuides.length} complete</span>
        </div>
        <h1 className="theme-text mt-3 text-3xl font-semibold">Your Jarvis guide</h1>
        <p className="theme-muted mt-3 max-w-2xl text-sm leading-6">Learn one workflow at a time. Start with the basics, resume where you left off, or choose a page below.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={!ready} onClick={() => start("essentials")} className="theme-button-primary rounded-xl px-4 py-3 text-sm font-semibold">Start / resume the basics</button>
          <button type="button" disabled={!ready} onClick={() => startDemo()} className="theme-button-secondary rounded-xl px-4 py-3 text-sm font-semibold">Start a fresh demo walkthrough</button>
        </div>
        <p className="theme-muted mt-3 text-xs leading-5">Fresh demo resets sample data and demo guides. Account settings still apply to your real account.</p>
      </header>
      <section aria-label="Walkthrough preferences" className="theme-card rounded-2xl p-4">
        <label className="theme-text flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" disabled={!ready} checked={progress.neverPrompt} onChange={(event) => setNeverPrompt(event.target.checked)} className="h-4 w-4 shrink-0" />
          Don’t show walkthrough suggestions again
        </label>
        <p className="theme-muted mt-1 text-xs leading-5">Manual guides stay available. Skips are saved for later; completed and dismissed guides stay quiet.</p>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Find a guide</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a guide, e.g. Plan or Finance" className="theme-input w-full rounded-xl px-4 py-3 text-base" />
        </label>
        <label>
          <span className="sr-only">Filter guides</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="theme-input max-w-full rounded-xl px-3 py-3 text-sm">
            <option value="all">All guides</option><option value="resume">Paused & skipped</option><option value="dismissed">Dismissed</option>
          </select>
        </label>
      </div>
      {categories.map((category) => {
        const guides = visible.filter((guide) => guide.category === category);
        if (!guides.length) return null;
        return (
          <section key={category} aria-label={category}>
            <h2 className="theme-text mb-3 text-lg font-semibold">{category}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {guides.map((guide) => {
                const saved = progress.guides[guide.id];
                const resumable = saved && ["in-progress", "skipped"].includes(saved.status);
                const status = saved?.status === "completed" ? "✓ Complete" : saved?.neverSuggest || saved?.status === "dismissed" ? "Suggestions off" : saved?.status === "skipped" ? "Skipped for now" : resumable ? "In progress" : guide.minutes + " min";
                return (
                  <article key={guide.id} data-guide-id={guide.id} className="theme-card flex min-w-0 flex-col rounded-2xl p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="theme-text text-base font-semibold">{guide.title}</h3><span className="theme-muted text-xs">{status}</span></div>
                    <p className="theme-muted mt-2 text-sm leading-6">{guide.description}</p>
                    {resumable && <p className="theme-muted mt-2 text-xs">Saved at step {saved.step + 1} of {guide.steps.length}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" disabled={!ready} onClick={() => start(guide.id)} className="theme-button-primary rounded-xl px-4 py-2 text-sm font-semibold">{resumable ? "Resume guide" : saved ? "Replay guide" : "Start guide"}</button>
                      {resumable && <button type="button" disabled={!ready} onClick={() => start(guide.id, true)} className="theme-button-secondary rounded-xl px-3 py-2 text-sm">Start over</button>}
                    </div>
                    <details className="mt-3">
                      <summary className="theme-muted flex min-h-11 cursor-pointer items-center text-sm font-semibold">Read the steps</summary>
                      <ol className="mt-2 space-y-4 pl-5">
                        {guide.steps.map((step) => <li key={step.id} className="list-decimal pl-1"><p className="theme-text text-sm font-semibold">{step.title}</p><p className="theme-muted mt-1 text-sm leading-6">{step.body}</p>{step.compactBody && <p className="theme-muted mt-1 text-sm leading-6 lg:hidden">{step.compactBody}</p>}{step.practice && <p className="theme-text mt-1 text-sm">{step.practice}</p>}</li>)}
                      </ol>
                    </details>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
      {!visible.length && <p className="theme-muted py-5 text-sm">No guides match. Try another topic or show all guides.</p>}
      <p className="theme-muted text-xs leading-5">{storageAvailable ? "Progress and reminder choices are saved for this account in this browser. Demo and personal progress are separate." : "Browser storage is unavailable. Guide progress is kept for this visit."}</p>
    </div>
  );
}
