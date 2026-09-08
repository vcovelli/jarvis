"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { editableTiers, rolloutLevels, type AdminUser } from "@/lib/admin/policy";
export function UserAccessForm({ user, canManage, ownAccount }: { user: AdminUser; canManage: boolean; ownAccount: boolean }) {
  const router = useRouter(); const [tier, setTier] = useState(user.tier); const [rollout, setRollout] = useState(user.rolloutLevel);
  const [busy, setBusy] = useState(false); const [refreshing, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const saving = busy || refreshing;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const change = { ...(tier !== user.tier ? { tier } : {}), ...(rollout !== user.rolloutLevel ? { rolloutLevel: rollout } : {}) };
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save changes.");
      setMessage("Saved. The change is recorded in activity."); startTransition(() => router.refresh());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save changes."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="theme-surface grid gap-4 rounded-2xl p-5">
    <h2 className="theme-text text-lg font-semibold">Access & rollout</h2>
    <label className="theme-text grid gap-2 text-sm">Entitlement<select aria-label="Entitlement" value={tier} disabled={!canManage || ownAccount || user.configuredAdmin || saving} onChange={(event) => setTier(event.target.value as typeof tier)} className="theme-input w-full rounded-xl px-3 py-3">{editableTiers.map((value) => <option key={value} disabled={value === "OWNER" && (!user.accessActive || Boolean(user.expiresAt))}>{value}</option>)}</select></label>
    <p className="theme-muted text-xs">{ownAccount ? "Another owner must change your entitlement." : user.configuredAdmin ? "Entitlement is controlled by server configuration." : "ADMIN can inspect the control plane. OWNER can manage access."}</p>
    <label className="theme-text grid gap-2 text-sm">Rollout<select aria-label="Rollout" value={rollout} disabled={!canManage || saving} onChange={(event) => setRollout(event.target.value as typeof rollout)} className="theme-input w-full rounded-xl px-3 py-3">{rolloutLevels.map((value) => <option key={value}>{value}</option>)}</select></label>
    <p className="theme-muted text-xs leading-5">STABLE: normal production experience. BETA: upcoming functionality ready for trusted testing. EXPERIMENTAL: newest functionality, which may be unfinished. Rollout never grants administrative access.</p>
    {canManage ? <button type="submit" disabled={saving || (tier === user.tier && rollout === user.rolloutLevel)} className="theme-button-primary rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button> : <p className="theme-muted text-sm">Only an owner can change these settings.</p>}
    <p role="status" className="theme-text text-sm">{message}</p>
  </form>;
}
