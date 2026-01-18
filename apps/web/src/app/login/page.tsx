"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1b2235,_#060912)] px-6 py-12 text-zinc-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Jarvis OS</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-zinc-300">Log in to access your private console.</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setLoading(true);
            const result = await signIn("credentials", {
              redirect: false,
              email,
              password,
            });
            setLoading(false);
            if (result?.error) {
              setError("Invalid email or password.");
              return;
            }
            router.push("/v2");
          }}
        >
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
            />
          </div>
          {error && <p className="text-sm text-rose-200">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-cyan-300 px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900 transition hover:bg-cyan-200 disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-400">
          New here?{" "}
          <Link href="/register" className="text-cyan-200 hover:text-cyan-100">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
