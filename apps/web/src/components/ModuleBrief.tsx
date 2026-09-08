type ModuleBriefProps = {
  eyebrow: string;
  title: string;
  state: string;
  action: string;
  trend: string;
  items: string[];
};

export function ModuleBrief({ eyebrow, title, state, action, trend, items }: ModuleBriefProps) {
  return (
    <div className="flex flex-col gap-4 lg:gap-8">
      <header className="mobile-compact-header">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/80 sm:text-sm">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white lg:mt-3">{title}</h1>
      </header>

      <section className="theme-surface mobile-card-padding rounded-[28px] p-5 lg:hidden">
        <p className="theme-kicker text-[10px] uppercase tracking-[0.28em]">Next move</p>
        <p className="theme-text mt-2 text-lg font-semibold leading-7">{action}</p>
        <div className="theme-card mt-4 rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.26em]">Current state</p>
          <p className="theme-text mt-2 text-sm leading-6">{state}</p>
        </div>
        <details className="theme-card mt-3 rounded-2xl p-4">
          <summary className="min-h-11 cursor-pointer text-sm font-semibold">More context and scope</summary>
          <p className="theme-muted mt-3 text-sm leading-6">{trend}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {items.map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-200">
                {item}
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="hidden gap-6 lg:grid lg:grid-cols-3">
        <Panel label="Current state" value={state} />
        <Panel label="Recommended action" value={action} />
        <Panel label="Historical trend" value={trend} />
      </section>

      <section className="glass-panel hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:block">
        <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Scope</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-200">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Panel({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
      <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">{label}</p>
      <p className="mt-4 text-lg font-semibold leading-7 text-white">{value}</p>
    </div>
  );
}
