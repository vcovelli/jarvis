export default function WorkspaceRouteLoading() {
  return (
    <section
      className="flex min-h-[clamp(18rem,56dvh,36rem)] w-full items-center justify-center px-3 py-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="theme-surface w-full max-w-sm rounded-[28px] border p-5 text-center">
        <div className="theme-accent-text mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-current/20 bg-current/8">
          <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" opacity="0.32" />
            <path d="M17.66 6.34H21V3" />
          </svg>
        </div>
        <p className="theme-kicker mt-4 text-[10px] font-semibold uppercase tracking-[0.34em]">Jarvis is readying your view</p>
        <h2 className="theme-text mt-2 text-lg font-semibold">Opening your workspace</h2>
        <p className="theme-muted mx-auto mt-2 max-w-xs text-sm leading-6">
          Keeping your saved work in place while this view finishes loading.
        </p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-current/8">
          <span
            className="mobile-loading-progress block h-full w-2/5 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </div>
      </div>
    </section>
  );
}
