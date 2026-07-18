"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#1b2235,#060912)] px-4 py-10 text-zinc-100 sm:px-6 lg:px-8">
      <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/[0.05] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-2xl sm:p-8">
        <div className="rounded-[24px] border border-white/10 bg-gradient-to-br from-cyan-400/12 via-white/6 to-indigo-400/10 p-4">
          <p className="text-[10px] uppercase tracking-[0.45em] text-cyan-200/80">Jarvis OS</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Create your space</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">Set up a calm and capable daily command center in minutes.</p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            const response = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email, password }),
            });
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setError(data.error ?? "Failed to register.");
              setLoading(false);
              return;
            }
            await signIn("credentials", {
              redirect: false,
              email,
              password,
            });
            setLoading(false);
            router.push("/v2");
          }}
        >
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">Name</label>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">Password</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20"
            />
          </div>
          {error && <p className="text-sm text-rose-200">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-cyan-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900 transition hover:bg-cyan-200 disabled:opacity-70"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-cyan-200 hover:text-cyan-100">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
