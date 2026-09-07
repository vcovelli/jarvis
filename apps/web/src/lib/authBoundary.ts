export function getAuthenticatedUserId(session: { user?: { id?: string | null } | null } | null | undefined) {
  return session?.user?.id || null;
}

export function ownedWhere(userId: string, id: string) {
  return { id, userId } as const;
}
