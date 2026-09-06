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
    <div className="theme-shell flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="theme-surface w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <div className="theme-card rounded-[24px] p-4">
          <p className="theme-kicker text-[10px] uppercase tracking-[0.45em]">Jarvis OS</p>
          <h1 className="theme-text mt-3 text-3xl font-semibold">Welcome back</h1>
          <p className="theme-muted mt-2 text-sm leading-6">Sign in to your personal console and keep your day moving smoothly.</p>
        </div>

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
            <label className="theme-muted text-xs uppercase tracking-[0.3em]">Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="theme-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition"
            />
          </div>
          <div className="space-y-2">
            <label className="theme-muted text-xs uppercase tracking-[0.3em]">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="theme-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition"
            />
          </div>
          {error && <p className="text-sm text-rose-200">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="theme-button-primary w-full rounded-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] transition disabled:opacity-70"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="theme-muted mt-6 text-xs">
          New here?{" "}
          <Link href="/register" className="theme-accent-text font-semibold">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
