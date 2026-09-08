"use client";
export default function AdminErrorPage({ reset }: { reset: () => void }) {
  return <section className="theme-surface rounded-2xl p-5"><h1 className="theme-text text-xl font-semibold">Control plane unavailable</h1><p className="theme-muted mt-3 text-sm">The server could not load administrative data. Check database readiness and the installed migrations.</p><button type="button" onClick={reset} className="theme-button-secondary mt-4 rounded-xl px-4 py-3 text-sm">Try again</button></section>;
}
