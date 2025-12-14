"use client";

import { useMemo, useState } from "react";

import { JarvisState, SleepEntry, getDayKey, useJarvisState } from "@/lib/jarvisStore";

export default function SleepPage() {
  const { state, hydrated, logSleep } = useJarvisState();
  const todayKey = getDayKey();
  const [hours, setHours] = useState(7);
  const [quality, setQuality] = useState(3);
  const [dreams, setDreams] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saved">("idle");

  const recentNights = useMemo(() => getRecentSleep(state, 7), [state]);
  const averageHours = useMemo(() => computeAverageHours(recentNights), [recentNights]);

  if (!hydrated) {
    return <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">Loading sleep log…</p>;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    logSleep({
      day: todayKey,
      durationMins: hours * 60,
      quality,
      dreams,
      notes,
    });
    setDreams("");
    setNotes("");
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Sleep</p>
        <h1 className="mt-2 text-4xl font-semibold text-white">Recharge console</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-300">
          Track duration, quality, and dream patterns to tie rest directly to mood and performance.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Log last night</h2>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="text-sm text-zinc-300">
              Hours slept: <span className="text-cyan-300">{hours}h</span>
            </label>
            <input
              type="range"
              min={3}
              max={12}
              value={hours}
              onChange={(event) => setHours(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded bg-zinc-700 accent-emerald-300"
            />
            <label className="text-sm text-zinc-300">
              Quality: <span className="text-cyan-300">{quality}/5</span>
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded bg-zinc-700 accent-cyan-300"
            />
            <textarea
              value={dreams}
              onChange={(event) => setDreams(event.target.value)}
              rows={3}
              placeholder="Dreams? Themes?"
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Recovery notes or habits"
              className="rounded-2xl border border-white/5 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-400 px-4 py-3 text-sm font-semibold text-zinc-900"
            >
              Log sleep
            </button>
            {status === "saved" && <p className="text-sm text-emerald-300">Saved.</p>}
          </form>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <h2 className="text-lg font-medium text-white">Recent nights</h2>
          <p className="mt-1 text-sm text-zinc-300">
            Avg {averageHours.toFixed(1)}h over last {recentNights.length} nights.
          </p>
          <div className="mt-4 space-y-3">
            {recentNights.length === 0 ? (
              <p className="text-sm text-zinc-400">No entries yet. Log last night above.</p>
            ) : (
              recentNights.map((night) => (
                <div
                  key={night.id}
                  className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/20 px-4 py-3"
                >
                  <div>
                    <p className="text-base font-semibold text-white">
                      {(night.durationMins / 60).toFixed(1)}h
                    </p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">
                      {new Date(night.day).toLocaleDateString()} • Quality {night.quality}/5
                    </p>
                  </div>
                  {night.dreams && (
                    <p className="max-w-xs text-xs text-zinc-300">{night.dreams}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function getRecentSleep(state: JarvisState, limit: number): SleepEntry[] {
  const all = Object.values(state.sleep).flat();
  return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

function computeAverageHours(entries: SleepEntry[]): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((sum, entry) => sum + entry.durationMins, 0);
  return total / entries.length / 60;
}
