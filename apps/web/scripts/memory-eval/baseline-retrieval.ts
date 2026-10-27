// Frozen V2 retrieval, evaluated 2026-10-26. Only import paths and ranking timer differ.
import { Prisma, type PrismaClient, type MemoryRecord } from "@prisma/client";
import {
  assertAccess,
  digest,
  hasSecrets,
  tokens,
  type Access,
} from "../../src/lib/memory/policy.ts";
import {
  allowedDisclosure,
  embeddingProvider,
  validateVector,
  type EmbeddingIdentity,
} from "../../src/lib/memory/embedding.ts";
import { audit } from "../../src/lib/memory/store.ts";

export class BoundedCache<T> {
  private entries = new Map<string, { value: T; until: number }>();
  readonly capacity: number;
  readonly ttl: number;
  constructor(capacity = 128, ttl = 30000) {
    this.capacity = Math.max(1, capacity);
    this.ttl = ttl;
  }
  get(key: string, now = Date.now()) {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.until <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: T, now = Date.now()) {
    this.entries.delete(key);
    while (this.entries.size >= this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, until: now + this.ttl });
  }
  clear() {
    this.entries.clear();
  }
}
type Rank = { id: string; lexical?: number; semantic?: number; score: number };
const cache = new BoundedCache<Rank[]>();
const queryCache = new BoundedCache<number[]>(64, 60000);
export function clearMemoryCaches() {
  cache.clear();
  queryCache.clear();
}
export function cacheKey(
  access: Access,
  revision: number,
  query: string,
  extra: unknown,
) {
  return digest(
    JSON.stringify([
      access.userId,
      access.agent,
      access.domains,
      access.labels,
      access.operation,
      revision,
      query,
      extra,
    ]),
  );
}
export function fuse(
  lexical: string[],
  semantic: string[],
  rows: Pick<
    MemoryRecord,
    "id" | "domain" | "importance" | "assertion" | "sourceAt"
  >[],
  domains: readonly string[],
  now = Date.now(),
): Rank[] {
  return rows
    .map((row) => {
      const l = lexical.indexOf(row.id),
        s = semantic.indexOf(row.id);
      const reliability =
        row.assertion === "verified_application"
          ? 1
          : row.assertion === "user_stated"
            ? 0.8
            : 0.3;
      const freshness =
        1 / (1 + Math.max(0, now - +row.sourceAt) / (90 * 86400000));
      return {
        id: row.id,
        ...(l >= 0 ? { lexical: l + 1 } : {}),
        ...(s >= 0 ? { semantic: s + 1 } : {}),
        score:
          (l >= 0 ? 1 / (60 + l + 1) : 0) +
          (s >= 0 ? 1 / (60 + s + 1) : 0) +
          (0.001 * row.importance) / 5 +
          0.001 * reliability +
          0.0005 * freshness +
          (domains.includes(row.domain) && row.domain !== "general"
            ? 0.001
            : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
export function accessSql(access: Access, now: Date, includeHistory = false) {
  assertAccess(access);
  // MATERIALIZED candidate queries below apply every authorization clause in SQL.
  if (!access.labels.length) return Prisma.sql`FALSE`;
  const agentLabel =
    access.agent === "financial-analyst"
      ? "finance"
      : ["infrastructure-monitor", "security-analyst"].includes(access.agent)
        ? "infrastructure"
        : null;
  return Prisma.sql`"userId" = ${access.userId}
    AND "status" ${includeHistory ? Prisma.sql`IN ('active','superseded')` : Prisma.sql`= 'active'`}
    AND "effectiveAt" <= ${now} AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
    ${includeHistory ? Prisma.empty : Prisma.sql`AND ("validUntil" IS NULL OR "validUntil" > ${now})`}
    AND NOT EXISTS (SELECT 1 FROM unnest("labels") label WHERE label NOT IN (${Prisma.join([...access.labels])}))
    ${agentLabel ? Prisma.sql`AND ${agentLabel} = ANY("labels")` : Prisma.empty}
    ${access.agent === "financial-analyst" ? Prisma.sql`AND "domain" IN ('finance','real-estate','crypto','stock-strategy','agent-finance')` : Prisma.empty}
    ${["infrastructure-monitor", "security-analyst"].includes(access.agent) ? Prisma.sql`AND "domain" IN ('server','coding','laptop','enterprise-engineering','agent-infrastructure','agent-security')` : Prisma.empty}
    ${access.agent === "executive-planner" ? Prisma.sql`AND "domain" IN ('general','finance','career','work','project-finance','project-work')` : Prisma.empty}
    ${access.domains.length ? Prisma.sql`AND "domain" IN (${Prisma.join([...access.domains])})` : Prisma.empty}`;
}
export type RetrievalOptions = {
  limit?: number;
  vector?: EmbeddingIdentity & { values: number[] };
  now?: Date;
};
export let baselineRankingMs = 0;
export async function retrieve(
  db: PrismaClient,
  access: Access,
  query: string,
  options: RetrievalOptions = {},
) {
  baselineRankingMs = 0;
  assertAccess(access);
  const started = performance.now(),
    now = options.now ?? new Date();
  query = query.trim().slice(0, 1000);
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 8)));
  const revision =
    (await db.memoryState.findUnique({ where: { userId: access.userId } }))
      ?.revision ?? 0;
  let provider;
  try {
    provider = embeddingProvider();
  } catch {
    provider = null;
  }
  let vector = options.vector;
  const mode = process.env.MEMORY_VECTOR_ENABLED === "true";
  // Query text is as sensitive as memory. Only explicitly permitted loopback inference is
  // performed on the request path; hosted query calls require a future durable cost flow.
  if (
    !vector &&
    mode &&
    provider?.kind === "local" &&
    allowedDisclosure(provider, access.labels, query) &&
    query
  ) {
    const key = cacheKey(access, revision, query, [
      provider.model,
      provider.version,
      provider.dimension,
    ]);
    let values = queryCache.get(key);
    if (!values) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        values = await Promise.race([
          provider.embed(query),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("query_timeout")), 800);
          }),
        ]);
        queryCache.set(key, values);
      } catch {
        /* Text retrieval remains authoritative during provider outages. */
      } finally {
        clearTimeout(timer);
      }
    }
    if (values)
      vector = {
        model: provider.model,
        version: provider.version,
        dimension: provider.dimension,
        values,
      };
  }
  if (vector) validateVector(vector.values, vector.dimension);
  const key = cacheKey(access, revision, query, [limit, mode, vector ?? null]);
  let ranked = cache.get(key);
  const hit = Boolean(ranked);
  const filter = accessSql(access, now);
  if (!ranked) {
    // OR across meaningful lexemes handles natural questions without requiring every word.
    const terms =
      query
        .toLowerCase()
        .match(/[\p{L}\p{N}_-]+/gu)
        ?.filter(
          (w) =>
            !/^(what|did|we|i|my|me|the|a|an|about|are|is|was|were|do|does|how|when|which|it|to|of|for|and|in|on|last|month|current|previously|say|tell)$/.test(
              w,
            ),
        )
        .slice(0, 24) ?? [];
    const tsQuery = terms.join(" OR ");
    const lexical =
      tsQuery && !hasSecrets(query)
        ? await db.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
            return tx.$queryRaw<
              { id: string }[]
            >(Prisma.sql`SELECT "id" FROM "MemoryRecord" WHERE ${filter}
        AND "searchVector" @@ websearch_to_tsquery('english', ${tsQuery})
        ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('english', ${tsQuery})) DESC, "id" ASC LIMIT 80`);
          })
        : [];
    let semantic: { id: string }[] = [];
    if (mode && vector && !hasSecrets(query)) {
      try {
        semantic = await db.$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
          const installed = await tx.$queryRaw<
            { present: boolean }[]
          >`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present`;
          if (!installed[0]?.present) return [];
          return tx.$queryRaw<
            { id: string }[]
          >(Prisma.sql`WITH eligible AS MATERIALIZED (
            SELECT "id", "embedding" FROM "MemoryRecord" WHERE ${filter}
            AND "embeddingStatus" = 'ready' AND "embeddingModel" = ${vector!.model}
            AND "embeddingVersion" = ${vector!.version} AND "embeddingDimension" = ${vector!.dimension}
            AND cardinality("embedding") = ${vector!.dimension}
          ) SELECT "id" FROM eligible WHERE ("embedding"::vector <=> ${JSON.stringify(vector!.values)}::vector) < 0.6
          ORDER BY "embedding"::vector <=> ${JSON.stringify(vector!.values)}::vector, "id" ASC LIMIT 80`);
        });
      } catch {
        /* Optional extension or vector provider cannot disable full-text mode. */
      }
    }
    const ids = [...new Set([...lexical, ...semantic].map((row) => row.id))];
    const rows = ids.length
      ? await db.$queryRaw<MemoryRecord[]>(
          Prisma.sql`SELECT "id", "domain", "importance", "assertion", "sourceAt" FROM "MemoryRecord" WHERE ${filter} AND "id" IN (${Prisma.join(ids)})`,
        )
      : [];
    const rankingStarted = performance.now();
    ranked = fuse(
      lexical.map((r) => r.id),
      semantic.map((r) => r.id),
      rows,
      access.domains,
      +now,
    ).slice(0, limit);
    baselineRankingMs = performance.now() - rankingStarted;
    cache.set(key, ranked);
  }
  const ids = ranked.map((r) => r.id);
  // Cache contains IDs/ranks only; ownership, visibility, deletion and expiry are rechecked.
  const rows = ids.length
    ? await db.$queryRaw<MemoryRecord[]>(
        Prisma.sql`SELECT "id", "title", "content", "domain", "type", "sourceAt", "assertion", "confidenceKind", "confidence", "conflict", "importance" FROM "MemoryRecord" WHERE ${filter} AND "id" IN (${Prisma.join(ids)})`,
      )
    : [];
  const sourceGroups = rows.length
    ? await db.memoryRecord.findMany({
        where: { userId: access.userId, id: { in: rows.map((r) => r.id) } },
        select: {
          sources: {
            where: { userId: access.userId },
            take: 5,
            orderBy: [{ sourceAt: "desc" }, { id: "asc" }],
            select: {
              memoryId: true,
              sourceType: true,
              sourceId: true,
              sourceAt: true,
              reliability: true,
            },
          },
        },
      })
    : [];
  const sources = sourceGroups.flatMap((group) => group.sources);
  const items = ranked.flatMap((rank) => {
    const row = rows.find((r) => r.id === rank.id);
    if (!row || hasSecrets(row.content)) return [];
    const evidence = sources.filter((s) => s.memoryId === row.id).slice(0, 5);
    if (!evidence.length) return [];
    return [
      {
        id: row.id,
        excerpt: row.content,
        title: row.title,
        scope: row.domain,
        type: row.type,
        freshness: row.sourceAt,
        assertion: row.assertion,
        confidence: { kind: row.confidenceKind, value: row.confidence },
        conflict: row.conflict,
        sources: evidence,
        relevance: rank,
        tokenEstimate: tokens(row.content),
      },
    ];
  });
  const latencyMs = Math.round(performance.now() - started);
  await db.$transaction(async (tx) => {
    await audit(tx, access.userId, "retrieved", {
      agent: access.agent,
      ids: items.map((i) => i.id),
      ranks: items.map((i) => ({
        id: i.id,
        lexical: i.relevance.lexical ?? null,
        semantic: i.relevance.semantic ?? null,
      })),
      cacheHit: hit,
      latencyMs,
      count: items.length,
    });
    if (items.length)
      await tx.memoryRecord.updateMany({
        where: { userId: access.userId, id: { in: items.map((i) => i.id) } },
        data: { lastAccessedAt: now },
      });
  });
  return { items, latencyMs, cacheHit: hit, revision };
}
export async function listMemories(
  db: PrismaClient,
  access: Access,
  options: {
    query?: string;
    after?: string;
    history?: boolean;
    conflicts?: boolean;
  } = {},
) {
  assertAccess(access);
  const q = (options.query ?? "").slice(0, 200);
  const ids = await db.$queryRaw<
    { id: string }[]
  >(Prisma.sql`SELECT "id" FROM "MemoryRecord" WHERE ${accessSql(access, new Date(), options.history)}
    ${q ? Prisma.sql`AND ("content" ILIKE ${`%${q.replace(/[\\%_]/g, "\\$&")}%`} OR "title" ILIKE ${`%${q.replace(/[\\%_]/g, "\\$&")}%`})` : Prisma.empty}
    ${options.after ? Prisma.sql`AND "id" > ${options.after}` : Prisma.empty}
    ${options.conflicts ? Prisma.sql`AND "conflict" = true` : Prisma.empty}
    ORDER BY "id" ASC LIMIT 51`);
  const rows = await db.memoryRecord.findMany({
    where: {
      userId: access.userId,
      id: { in: ids.slice(0, 50).map((r) => r.id) },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      content: true,
      domain: true,
      type: true,
      assertion: true,
      extractionMethod: true,
      confidenceKind: true,
      status: true,
      conflict: true,
      supersededById: true,
      sourceAt: true,
      createdAt: true,
      updatedAt: true,
      sources: {
        select: {
          sourceType: true,
          sourceId: true,
          sourceAt: true,
          reliability: true,
        },
        take: 5,
        orderBy: { sourceAt: "desc" },
      },
    },
  });
  await audit(db, access.userId, "listed", {
    ids: rows.map((r) => r.id),
    count: rows.length,
  });
  return {
    memories: rows.map((row) => ({
      ...row,
      key: row.title,
      value: row.content,
      source: row.assertion,
      confidence: null,
    })),
    nextCursor: ids.length > 50 ? ids[49].id : null,
  };
}
