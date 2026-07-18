import Link from "next/link";

import { MarkdownDocument } from "@/components/MarkdownDocument";
import {
  getHomelabDocIndex,
  getHomelabDocument,
  groupDocsByCategory,
  searchHomelabDocs,
} from "@/lib/homelabDocs";

export const revalidate = 60;

type DocumentationPageProps = {
  searchParams?: Promise<{
    doc?: string;
    q?: string;
  }>;
};

export default async function DocumentationPage({ searchParams }: DocumentationPageProps) {
  const params = await searchParams;
  const [index, document, searchResults] = await Promise.all([
    getHomelabDocIndex(),
    getHomelabDocument(params?.doc),
    params?.q ? searchHomelabDocs(params.q) : Promise.resolve([]),
  ]);
  const groupedDocs = groupDocsByCategory(index);
  const query = params?.q?.trim() ?? "";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Documentation</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Homelab docs browser</h1>
        </div>
        <form action="/v2/documentation" className="flex w-full gap-2 sm:w-auto">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search docs"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-zinc-500 sm:w-64"
          />
          <button
            type="submit"
            className="rounded-full bg-cyan-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-950"
          >
            Search
          </button>
        </form>
      </header>

      {query && (
        <section className="glass-panel rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
            Search results for {query}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {searchResults.length ? (
              searchResults.map((result) => (
                <Link
                  key={result.id}
                  href={`/v2/documentation?doc=${encodeURIComponent(result.id)}&q=${encodeURIComponent(query)}`}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/80 hover:border-cyan-300/40"
                >
                  {result.relativePath}
                </Link>
              ))
            ) : (
              <p className="text-sm text-zinc-300">No matching documents found.</p>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="glass-panel h-fit rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-lg lg:sticky lg:top-10">
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">Categories</p>
          <nav className="mt-4 max-h-[70dvh] space-y-5 overflow-y-auto pr-1">
            {Object.entries(groupedDocs).map(([category, docs]) => (
              <div key={category}>
                <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-200/80">
                  {category}
                </p>
                <div className="mt-2 space-y-1">
                  {docs.slice(0, category === "snapshots" ? 12 : docs.length).map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/v2/documentation?doc=${encodeURIComponent(doc.id)}`}
                      className={`block rounded-xl px-3 py-2 text-sm ${
                        document?.id === doc.id
                          ? "bg-cyan-300/15 text-cyan-100"
                          : "text-zinc-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {doc.title}
                    </Link>
                  ))}
                  {category === "snapshots" && docs.length > 12 && (
                    <p className="px-3 py-2 text-xs text-zinc-500">
                      Showing latest indexed snapshot files in search and direct links.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="glass-panel min-w-0 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg">
          {document ? (
            <>
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-400">
                    {document.relativePath}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{document.title}</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-zinc-300">
                  {document.lastRefreshed ?? document.updatedAt ?? "No refresh stamp"}
                </span>
              </div>
              <MarkdownDocument content={document.content} />
              <details className="mt-8 rounded-2xl border border-white/10 bg-black/30 p-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.25em] text-white/80">
                  Raw Markdown
                </summary>
                <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-black/40 p-4 text-xs leading-6 text-zinc-200">
                  <code>{document.content}</code>
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-zinc-300">No documentation files found.</p>
          )}
        </main>
      </div>
    </div>
  );
}
