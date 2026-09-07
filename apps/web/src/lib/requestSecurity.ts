import { createHash } from "node:crypto";

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

function readHeader(headers: HeaderSource, name: string) {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct;
}

export function getClientIp(source: Request | { headers?: HeaderSource }) {
  const headers = source instanceof Request ? source.headers : source.headers;
  const trustProxy = process.env.TRUST_PROXY_HEADERS?.trim().toLowerCase() === "true";
  if (trustProxy) {
    const forwarded = readHeader(headers, "x-forwarded-for")?.split(",")[0]?.trim();
    const real = readHeader(headers, "x-real-ip")?.trim();
    if (forwarded) return forwarded.slice(0, 64);
    if (real) return real.slice(0, 64);
  }
  return "unknown";
}

export function getUserAgent(source: Request | { headers?: HeaderSource }) {
  const headers = source instanceof Request ? source.headers : source.headers;
  return readHeader(headers, "user-agent")?.slice(0, 512) ?? undefined;
}

export function opaqueIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
