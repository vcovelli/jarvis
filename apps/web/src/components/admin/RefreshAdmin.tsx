"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RefreshAdmin() {
  const router = useRouter(); const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(() => router.refresh())} className="theme-button-secondary rounded-xl px-4 py-3 text-sm">{pending ? "Refreshing…" : "Refresh status"}</button>;
}
