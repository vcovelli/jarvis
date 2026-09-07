"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState("Verifying your email…");
  const [ok, setOk] = useState(false);
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [developmentUrl, setDevelopmentUrl] = useState<string | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    void fetch("/api/auth/email-verification/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (response) => ({ response, data: await response.json().catch(() => ({})) }))
      .then(({ response, data }) => { setOk(response.ok); setStatus(response.ok ? "Email verified. You can sign in." : data.error ?? "Verification failed."); })
      .catch(() => setStatus("Verification failed. Please request another link."));
  }, []);
  return (
    <main className="theme-shell flex min-h-screen items-center justify-center px-4 py-10">
      <section className="theme-surface w-full max-w-md rounded-[32px] p-8 text-center">
        <p className="theme-kicker text-xs uppercase tracking-[0.35em]">Email verification</p>
        <h1 className="theme-text mt-4 text-2xl font-semibold">{status}</h1>
        <Link className="theme-button-primary mt-6 inline-block rounded-full px-5 py-3 text-sm font-semibold" href={ok ? "/login" : "/register"}>{ok ? "Sign in" : "Back"}</Link>
        {!ok && (
          <form className="mt-8 space-y-3 text-left" onSubmit={async (event) => {
            event.preventDefault(); setResending(true); setDevelopmentUrl(null);
            const response = await fetch("/api/auth/email-verification/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
            const data = await response.json().catch(() => ({})); setResending(false);
            setStatus(response.ok ? data.message ?? "If verification is needed, a new link has been prepared." : data.error ?? "Could not request another link.");
            setDevelopmentUrl(data.developmentVerificationUrl ?? null);
          }}>
            <label className="theme-muted block text-xs uppercase tracking-[0.25em]" htmlFor="verification-email">Need a new link?</label>
            <input id="verification-email" className="theme-input w-full rounded-2xl px-4 py-3" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <button className="theme-button-secondary w-full rounded-full px-4 py-3 text-sm font-semibold" disabled={resending}>{resending ? "Requesting…" : "Resend verification"}</button>
            {developmentUrl && <a className="theme-accent-text block break-all text-xs" href={developmentUrl}>Developer verification link</a>}
          </form>
        )}
      </section>
    </main>
  );
}
