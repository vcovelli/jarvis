import { hasSecrets, type Label } from "./policy.ts";

export type EmbeddingIdentity = {
  model: string;
  version: string;
  dimension: number;
};
export type EmbeddingProvider = EmbeddingIdentity & {
  kind: "local" | "hosted";
  allowedLabels: readonly string[];
  usdPerMillion: number;
  dailyUsd: number;
  embed: (text: string) => Promise<number[]>;
};
export function compatible(a: EmbeddingIdentity, b: EmbeddingIdentity) {
  return (
    a.model === b.model &&
    a.version === b.version &&
    a.dimension === b.dimension
  );
}
export function allowedDisclosure(
  provider: EmbeddingProvider,
  labels: readonly Label[] | readonly string[],
  text: string,
) {
  return (
    !hasSecrets(text) &&
    labels.every((label) => provider.allowedLabels.includes(label))
  );
}
export function validateVector(value: unknown, dimension: number): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== dimension ||
    !value.every(
      (n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e10,
    ) ||
    !value.some((n) => n !== 0)
  )
    throw new Error("invalid_embedding");
  return value;
}
// Both adapters use the common {model,input} -> {data:[{embedding}]} HTTP contract.
// No default endpoint, key, model, price, or disclosure policy is inferred.
export function embeddingProvider(
  env: Record<string, string | undefined> = process.env,
  transport: typeof fetch = fetch,
): EmbeddingProvider | null {
  const kind = env.MEMORY_EMBEDDING_PROVIDER;
  if (!kind || kind === "disabled") return null;
  if (kind !== "local" && kind !== "hosted")
    throw new Error("invalid_embedding_provider");
  const url = new URL(env.MEMORY_EMBEDDING_URL ?? "");
  if (url.username || url.password || url.search || url.hash)
    throw new Error("invalid_embedding_endpoint");
  if (
    kind === "local" &&
    (!["127.0.0.1", "[::1]"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol))
  )
    throw new Error("local_embedding_requires_loopback");
  if (kind === "hosted" && url.protocol !== "https:")
    throw new Error("hosted_embedding_requires_https");
  const model = env.MEMORY_EMBEDDING_MODEL?.trim(),
    version = env.MEMORY_EMBEDDING_VERSION?.trim();
  const dimension = Number(env.MEMORY_EMBEDDING_DIMENSION);
  const allowedLabels = (env.MEMORY_EMBEDDING_ALLOWED_LABELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const usdPerMillion = Number(env.MEMORY_EMBEDDING_USD_PER_MILLION ?? 0),
    dailyUsd = Number(env.MEMORY_EMBEDDING_DAILY_USD ?? 0);
  if (
    !model ||
    !version ||
    model.length > 120 ||
    version.length > 80 ||
    !Number.isInteger(dimension) ||
    dimension < 1 ||
    dimension > 4096
  )
    throw new Error("invalid_embedding_identity");
  if (
    kind === "hosted" &&
    (!(usdPerMillion > 0) ||
      !(dailyUsd > 0) ||
      !Number.isFinite(usdPerMillion) ||
      !Number.isFinite(dailyUsd))
  )
    throw new Error("embedding_budget_required");
  return {
    kind,
    model: `${kind}:${model}`,
    version,
    dimension,
    allowedLabels,
    usdPerMillion,
    dailyUsd,
    async embed(text) {
      if (text.length > 4000 || hasSecrets(text))
        throw new Error("embedding_content_rejected");
      const response = await transport(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/json",
          ...(env.MEMORY_EMBEDDING_KEY
            ? { Authorization: `Bearer ${env.MEMORY_EMBEDDING_KEY}` }
            : {}),
        },
        body: JSON.stringify({ model, input: text }),
      });
      if (!response.ok) throw new Error("embedding_provider_failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("invalid_embedding_response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 262144) throw new Error("embedding_response_too_large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      return validateVector(body?.data?.[0]?.embedding, dimension);
    },
  };
}
