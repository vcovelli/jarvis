import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

const capabilityTiles = [
  ["Plan", "Daily priorities, time blocks, and task momentum stay in one private workspace."],
  ["Reflect", "Mood, journal, sleep, and reviews turn scattered notes into useful patterns."],
  ["Operate", "Finance, assistant memory, homelab, and objective tracking support deeper systems work."],
];

const readinessItems = [
  "Private user workspaces",
  "PWA install support",
  "Postgres persistence",
  "Self-hostable Next.js stack",
];

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/v2");
  }
  return (
    <main className="min-h-screen bg-[#05070b] text-zinc-50">
      <section className="relative isolate overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#05070b_0%,#101522_50%,#0a1512_100%)]" />
        <div className="absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,rgba(34,211,238,0.16),rgba(34,211,238,0))]" />
        <div className="absolute bottom-8 right-[-8rem] hidden w-[45rem] rotate-[-4deg] rounded-lg border border-white/10 bg-black/35 p-4 shadow-[0_28px_100px_rgba(0,0,0,0.45)] backdrop-blur md:block">
          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-200">Today</p>
              <div className="mt-5 space-y-3">
                <div className="h-3 w-2/3 rounded-full bg-white/80" />
                <div className="h-3 w-5/6 rounded-full bg-white/35" />
                <div className="h-3 w-3/5 rounded-full bg-emerald-200/70" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {["Mood", "Sleep", "Plan"].map((label) => (
                  <div key={label} className="rounded-md border border-white/10 bg-black/35 p-3">
                    <p className="text-[9px] uppercase tracking-[0.22em] text-zinc-400">{label}</p>
                    <div className="mt-3 h-7 rounded bg-cyan-200/20" />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-100">Assistant</p>
                <p className="mt-3 text-sm text-white">3 next actions found</p>
              </div>
              <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-amber-100">Finance</p>
                <p className="mt-3 text-sm text-white">Cash flow reviewed</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-400">Review</p>
                <p className="mt-3 text-sm text-white">Weekly pattern ready</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto flex min-h-[680px] max-w-6xl flex-col px-5 py-6 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src="/icons/jarvis-icon-192.png" alt="" width={40} height={40} priority className="h-10 w-10 rounded-lg" />
              <div>
                <p className="text-sm font-semibold text-white">Jarvis OS</p>
                <p className="text-xs text-zinc-400">Personal operating console</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/login" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/85 transition hover:border-white/25 hover:text-white">
                Sign in
              </Link>
              <Link href="/register" className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
                Start hosted
              </Link>
            </div>
          </nav>

          <div className="flex flex-1 items-center py-16">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-200/85">Hosted monthly or self-hosted</p>
              <h1 className="mt-5 text-5xl font-semibold leading-[1.02] text-white sm:text-6xl lg:text-7xl">Jarvis OS</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-200">
                A private command center for planning, reflection, finance context, assistant memory, and the weekly review loop that turns daily noise into usable direction.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/register" className="rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_36px_rgba(34,211,238,0.22)] transition hover:bg-cyan-200">
                  Create hosted workspace
                </Link>
                <Link href="#self-host" className="rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                  View self-host option
                </Link>
              </div>
              <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
                {readinessItems.map((item) => (
                  <div key={item} className="rounded-lg border border-white/10 bg-black/25 px-4 py-3 text-sm text-zinc-200 backdrop-blur">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-zinc-950 px-5 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {capabilityTiles.map(([label, detail]) => (
            <article key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-semibold text-cyan-100">{label}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="self-host" className="bg-[#060906] px-5 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/80">Commercial options</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Use the hosted service or buy a self-host license.</h2>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border border-cyan-200/20 bg-cyan-300/10 p-6">
              <p className="text-sm font-semibold text-cyan-100">Hosted monthly</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Managed personal workspace</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-200">
                The fastest path for individuals who want account sync, installable web app access, managed updates, and a private profile without running infrastructure.
              </p>
              <Link href="/register" className="mt-6 inline-flex rounded-lg bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
                Start hosted
              </Link>
            </article>
            <article className="rounded-lg border border-emerald-200/20 bg-emerald-300/10 p-6">
              <p className="text-sm font-semibold text-emerald-100">Self-host license</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Own the deployment</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-200">
                Run Jarvis OS on your own Postgres and Next.js environment, keep data inside your infrastructure, and reserve hosted integrations for the features you choose to configure.
              </p>
              <Link href="/register" className="mt-6 inline-flex rounded-lg border border-emerald-200/30 px-5 py-3 text-sm font-semibold text-emerald-50 transition hover:border-emerald-100/60 hover:bg-emerald-200/10">
                Request license access
              </Link>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
