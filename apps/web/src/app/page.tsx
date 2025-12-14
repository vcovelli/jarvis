import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_#1b2235,_#060912)] px-6 py-12 text-center text-zinc-50">
      <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Jarvis OS</p>
      <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">Version selector</h1>
      <p className="mt-4 max-w-2xl text-base text-zinc-300">
        The console now lives under the <span className="text-white">/v2</span> namespace while we continue to iterate on the new layout.
      </p>
      <Link
        href="/v2"
        className="mt-8 rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg"
      >
        Enter v2 console
      </Link>
    </div>
  );
}
