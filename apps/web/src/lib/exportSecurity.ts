const prohibitedKey = /^(raw|.*password.*|.*token.*|.*secret.*|authorization|cookie|.*credential.*|api[-_]?key)$/i;

export function sanitizePortableExport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePortableExport);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !prohibitedKey.test(key))
      .map(([key, item]) => [key, sanitizePortableExport(item)]),
  );
}
