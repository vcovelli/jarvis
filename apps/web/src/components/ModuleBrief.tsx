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
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel label="Current state" value={state} />
        <Panel label="Recommended action" value={action} />
        <Panel label="Historical trend" value={trend} />
      </section>

      <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
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
