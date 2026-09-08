export const importantActions: Record<string, string> = {
  "auth.registration": "Registration", "auth.login": "Sign-in",
  "auth.password_reset": "Password reset", "auth.email_verification": "Email verification",
  "account.password_change": "Password changed", "account.sessions_revoked": "Sessions revoked",
  "account.deletion": "Account deleted", "finance.plaid_connection_added": "Finance account connected",
  "finance.plaid_connection_removed": "Finance account disconnected", "finance.sync_failed": "Finance sync failed",
  "finance.scheduled_sync_failed": "Scheduled finance sync failed",
  "admin.user_access_changed": "User access changed", "admin.owner_bootstrapped": "Owner assigned by operator",
};
export function presentActivity(entry: { id: string; userId: string | null; action: string; outcome: string; createdAt: Date; metadata: unknown }) {
  const meta = entry.metadata && typeof entry.metadata === "object" ? entry.metadata as Record<string, unknown> : {};
  const state = (value: unknown) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      tier: ["FREE", "INVITED", "PRO", "ADMIN", "OWNER"].includes(String(item.tier)) ? String(item.tier) : null,
      rolloutLevel: ["STABLE", "BETA", "EXPERIMENTAL"].includes(String(item.rolloutLevel)) ? String(item.rolloutLevel) : null,
    };
  };
  const bootstrap = entry.action === "admin.owner_bootstrapped";
  const administrative = entry.action === "admin.user_access_changed" || bootstrap;
  return {
    id: entry.id, actorId: bootstrap ? "server-operator" : entry.userId, action: importantActions[entry.action] ?? "Administrative activity",
    outcome: ["success", "failure", "denied"].includes(entry.outcome) ? entry.outcome : "Unavailable",
    createdAt: entry.createdAt.toISOString(),
    targetId: administrative && typeof meta.targetUserId === "string" ? meta.targetUserId.slice(0, 128) : null,
    previous: administrative ? state(meta.previous) : null, next: administrative ? state(meta.next) : null,
  };
}
export type AdminActivity = ReturnType<typeof presentActivity>;
