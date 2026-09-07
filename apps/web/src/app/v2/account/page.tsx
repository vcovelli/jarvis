"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

import {
  getStoredTheme,
  onThemeChange,
  themeModeOptions,
  themePaletteOptions,
  updateThemePreference,
  type ThemePreference,
} from "@/lib/theme";

export default function AccountPage() {
  const { data: session } = useSession();
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const deletePhrase = "delete my account";

  useEffect(() => {
    return onThemeChange(setTheme);
  }, []);

  function updateTheme(patch: Partial<ThemePreference>) {
    const next = updateThemePreference(patch);
    setTheme(next);
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-8">
      <header>
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/80">Account</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">Security & access</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-300">
          Manage your password and account lifecycle. Your data is private to this profile.
        </p>
      </header>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <h2 className="text-lg font-medium text-white">Signed-in user</h2>
        <p className="mt-2 text-sm text-zinc-300">{session?.user?.email ?? "—"}</p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/70 hover:text-white"
        >
          Sign out
        </button>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/api/account/export"
            className="theme-button-secondary inline-flex min-h-10 items-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Export my data
          </a>
          <button
            type="button"
            disabled={sessionBusy}
            onClick={async () => {
              if (!window.confirm("Sign out every Jarvis session, including this device?")) return;
              setSessionBusy(true);
              const response = await fetch("/api/account/sessions/revoke", { method: "POST" });
              if (response.ok) await signOut({ callbackUrl: "/login" });
              else setSessionBusy(false);
            }}
            className="theme-button-secondary min-h-10 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] disabled:opacity-60"
          >
            {sessionBusy ? "Signing out…" : "Sign out all sessions"}
          </button>
        </div>
      </section>

      <section className="theme-surface rounded-3xl p-6">
        <h2 className="theme-text text-lg font-medium">Appearance</h2>
        <p className="theme-muted mt-2 text-sm">Choose brightness and color independently. Every palette is designed for both light and dark foundations.</p>

        <div className="mt-6">
          <p className="theme-kicker text-[10px] font-semibold uppercase tracking-[0.3em]">Foundation</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {themeModeOptions.map((option) => {
              const active = theme.mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateTheme({ mode: option.value })}
                  className={"theme-card rounded-2xl p-4 text-left transition hover:-translate-y-0.5 " + (active ? "is-active" : "")}
                >
                  <span className="block h-9 w-full rounded-xl border border-[var(--border)]" style={{ background: option.swatch }} />
                  <span className="theme-text mt-3 block text-sm font-semibold">{option.label}</span>
                  <span className="theme-muted mt-1 block text-xs leading-5">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="theme-kicker text-[10px] font-semibold uppercase tracking-[0.3em]">Color palette</p>
            {theme.mode === "contrast" && <p className="theme-muted text-xs">High Contrast uses a brighter version of each palette</p>}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {themePaletteOptions.map((option) => {
              const active = theme.palette === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateTheme({ palette: option.value })}
                  className={"theme-card rounded-2xl p-4 text-left transition hover:-translate-y-0.5 " + (active ? "is-active" : "")}
                >
                  <span className="block h-10 w-full rounded-xl border border-[var(--border)]" style={{ background: option.swatch }} />
                  <span className="theme-text mt-3 block text-sm font-semibold">{option.label}</span>
                  <span className="theme-muted mt-1 block text-xs leading-5">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
        <h2 className="text-lg font-medium text-white">Change password</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Use a new password with at least 8 characters.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setPasswordError(null);
            setPasswordMessage(null);
            if (nextPassword !== confirmPassword) {
              setPasswordError("New passwords do not match.");
              return;
            }
            setPasswordBusy(true);
            const response = await fetch("/api/account/password", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ currentPassword, nextPassword }),
            });
            setPasswordBusy(false);
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setPasswordError(data.error ?? "Failed to update password.");
              return;
            }
            setPasswordMessage("Password updated. Signing in again…");
            await signOut({ callbackUrl: "/login" });
          }}
        >
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">
              Current password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">
                New password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.3em] text-zinc-400">
                Confirm password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
              />
            </div>
          </div>
          {passwordError && <p className="text-sm text-rose-200">{passwordError}</p>}
          {passwordMessage && <p className="text-sm text-emerald-200">{passwordMessage}</p>}
          <button
            type="submit"
            disabled={passwordBusy}
            className="rounded-full bg-cyan-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-900 transition hover:bg-cyan-200 disabled:opacity-70"
          >
            {passwordBusy ? "Updating..." : "Update password"}
          </button>
        </form>
      </section>

      <section className="glass-panel danger-panel rounded-3xl border border-rose-300/20 bg-rose-500/10 p-6 text-rose-100 backdrop-blur-lg">
        <h2 className="text-lg font-medium text-white">Delete account</h2>
        <p className="mt-2 text-sm text-rose-100/80">
          This permanently deletes your profile and all Jarvis data.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setDeleteError(null);
            if (deleteConfirm.trim().toLowerCase() !== deletePhrase) {
              setDeleteError(`Type "${deletePhrase}" to confirm.`);
              return;
            }
            setDeleteBusy(true);
            const response = await fetch("/api/account", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password: deletePassword }),
            });
            setDeleteBusy(false);
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setDeleteError(data.error ?? "Failed to delete account.");
              return;
            }
            await signOut({ callbackUrl: "/login" });
          }}
        >
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-rose-100/70">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              className="w-full rounded-2xl border border-rose-200/20 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-rose-200/60"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.3em] text-rose-100/70">
              Type to confirm
            </label>
            <input
              type="text"
              required
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              className="w-full rounded-2xl border border-rose-200/20 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-rose-200/60"
              placeholder={deletePhrase}
            />
          </div>
          {deleteError && <p className="text-sm text-rose-200">{deleteError}</p>}
          <button
            type="submit"
            disabled={deleteBusy}
            className="rounded-full border border-rose-200/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-100 transition hover:border-rose-200/70 disabled:opacity-70"
          >
            {deleteBusy ? "Deleting..." : "Delete account"}
          </button>
        </form>
      </section>
    </div>
  );
}
