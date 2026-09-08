"use client";

import Link from "next/link";
import { useState } from "react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="theme-shell auth-safe-area flex min-h-dvh items-center justify-center px-4">
      <section className="theme-surface w-full max-w-md rounded-[32px] p-6 sm:p-8">
        <p className="theme-kicker text-xs uppercase tracking-[0.35em]">Account recovery</p>
        <h1 className="theme-text mt-3 text-3xl font-semibold">Choose a new password</h1>
        <form className="mt-6 space-y-4" onSubmit={async (event) => {
          event.preventDefault(); setError(null); setMessage(null);
          if (password !== confirm) { setError("Passwords do not match."); return; }
          const token = new URLSearchParams(window.location.search).get("token") ?? "";
          if (!token) { setError("This reset link is incomplete. Request a new one."); return; }
          setBusy(true);
          const response = await fetch("/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
          const data = await response.json().catch(() => ({})); setBusy(false);
          if (!response.ok) { setError(data.error ?? "Could not reset password."); return; }
          setMessage("Password reset. All previous sessions have been invalidated."); setPassword(""); setConfirm("");
        }}>
          <input className="theme-input w-full rounded-2xl px-4 py-3" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" />
          <input className="theme-input w-full rounded-2xl px-4 py-3" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Confirm password" />
          <button className="theme-button-primary w-full rounded-full px-4 py-3 text-sm font-semibold" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
        </form>
        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
        {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
        <Link className="theme-accent-text mt-6 inline-block text-sm font-semibold" href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
