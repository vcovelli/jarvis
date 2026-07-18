import Link from "next/link";

import { getHomelabSnapshot } from "@/lib/homelabDocs";

export const revalidate = 60;

export default async function ServicesPage() {
  const snapshot = await getHomelabSnapshot();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Services</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Service catalog</h1>
        </div>
        <p className="max-w-xl text-sm leading-6 text-zinc-300">
          Status and links are derived from generated homelab docs. No credentials or raw command output are exposed.
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {snapshot.services.map((service) => (
          <article
            key={service.id}
            className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{service.name}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-300">{service.purpose}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  service.status === "active"
                    ? "bg-emerald-300/15 text-emerald-100"
                    : "bg-rose-300/15 text-rose-100"
                }`}
              >
                {service.status}
              </span>
            </div>

            <div className="mt-5 grid gap-3 text-sm">
              <Row label="Unit" value={service.unit} />
              <Row label="Ports" value={service.ports.length ? service.ports.join(", ") : "none"} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {service.localUrl && (
                <a
                  href={service.localUrl}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:border-cyan-300/40"
                >
                  Local
                </a>
              )}
              {service.tailscaleUrl && (
                <a
                  href={service.tailscaleUrl}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:border-cyan-300/40"
                >
                  Tailscale
                </a>
              )}
              <Link
                href={`/v2/documentation?doc=${encodeURIComponent(service.docId)}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:border-cyan-300/40"
              >
                Docs
              </Link>
            </div>

            {service.command && (
              <pre className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-cyan-100">
                <code>{service.command}</code>
              </pre>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
      <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">{label}</span>
      <span className="break-words text-right text-white">{value}</span>
    </div>
  );
}
