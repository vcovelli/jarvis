"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="theme-shell auth-safe-area flex min-h-dvh items-center justify-center px-4">
      <section className="theme-surface w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <p className="theme-kicker text-xs uppercase tracking-[0.35em]">Account recovery</p>
        <h1 className="theme-text mt-3 text-3xl font-semibold">Reset your password</h1>
        <p className="theme-muted mt-2 text-sm leading-6">Enter your account email. The response is the same whether or not an account matches.</p>
        <form className="mt-6 space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const response = await fetch("/api/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
          const data = await response.json().catch(() => ({}));
          setBusy(false);
          setMessage(data.message ?? (response.ok ? "Check your email for the next step." : data.error ?? "Please try again later."));
          setDevelopmentUrl(data.developmentResetUrl ?? null);
        }}>
          <input className="theme-input w-full rounded-2xl px-4 py-3" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <button className="theme-button-primary w-full rounded-full px-4 py-3 text-sm font-semibold" disabled={busy}>{busy ? "Preparing…" : "Send reset link"}</button>
        </form>
        {message && <p className="theme-muted mt-4 text-sm">{message}</p>}
        {developmentUrl && <a className="theme-accent-text mt-3 block break-all text-xs" href={developmentUrl}>Developer reset link</a>}
        <Link className="theme-accent-text mt-6 inline-block text-sm font-semibold" href="/login">Back to sign in</Link>
      </section>
    </main>
  );
}
