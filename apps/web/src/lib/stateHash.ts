const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

export function createStateETag(state: unknown): string {
  const json = JSON.stringify(state);
  return createETagFromJson(json);
}

export function createETagFromJson(json: string): string {
  const hash = fnv1a(json);
  return `W/"${hash}-${json.length}"`;
}

function fnv1a(value: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16);
}
