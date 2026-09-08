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
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="theme-shell auth-safe-area flex min-h-dvh items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="theme-surface w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <div className="theme-card rounded-[24px] p-4">
          <p className="theme-kicker text-[10px] uppercase tracking-[0.45em]">Jarvis OS</p>
          <h1 className="theme-text mt-3 text-3xl font-semibold">Create your space</h1>
          <p className="theme-muted mt-2 text-sm leading-6">Set up a calm and capable daily command center in minutes.</p>
        </div>

        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);
            setLoading(true);
            const response = await fetch("/api/auth/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email, password, accessCode }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              setError(data.error ?? "Failed to register.");
              setLoading(false);
              return;
            }
            if (data.verificationRequired) {
              setLoading(false);
              setMessage("Account created. Verify your email before signing in.");
              setDevelopmentUrl(data.developmentVerificationUrl ?? null);
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
            <label className="theme-muted text-xs uppercase tracking-[0.3em]">Name</label>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="theme-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition"
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="theme-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition"
            />
          </div>
          <div className="space-y-2">
            <label className="theme-muted text-xs uppercase tracking-[0.3em]">Access code</label>
            <input
              type="text"
              autoComplete="off"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              className="theme-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition"
              placeholder="Optional"
            />
          </div>
          {error && <p className="text-sm text-rose-200">{error}</p>}
          {message && <p className="text-sm text-emerald-200">{message}</p>}
          {developmentUrl && <a className="theme-accent-text block break-all text-xs" href={developmentUrl}>Developer verification link</a>}
          <button
            type="submit"
            disabled={loading}
            className="theme-button-primary w-full rounded-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.3em] transition disabled:opacity-70"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="theme-muted mt-6 text-xs">
          Already have an account?{" "}
          <Link href="/login" className="theme-accent-text font-semibold">
            Sign in
          </Link>
          {" · "}
          <Link href="/verify-email" className="theme-accent-text font-semibold">
            Resend verification
          </Link>
        </p>
      </div>
    </div>
  );
}
