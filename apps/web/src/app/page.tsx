import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/v2");
  }
  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_#1b2235,_#060912)] px-6 py-12 text-center text-zinc-50">
      <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Jarvis OS</p>
      <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Version selector</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-300">
        The console now lives under the <span className="text-white">/v2</span> namespace while we continue to iterate on the new layout.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login"
          className="rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white/90"
        >
          Create account
        </Link>
      </div>
    </div>
  );
}
