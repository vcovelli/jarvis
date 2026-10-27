import { createHash } from "node:crypto";

export const TYPES = [
  "semantic",
  "episodic",
  "working",
  "procedural",
  "reference",
] as const;
export type MemoryType = (typeof TYPES)[number];
export const LABELS = [
  "private",
  "finance",
  "health",
  "journal",
  "infrastructure",
  "work",
] as const;
export type Label = (typeof LABELS)[number];
export type Agent =
  | "assistant"
  | "financial-analyst"
  | "infrastructure-monitor"
  | "security-analyst"
  | "executive-planner";
const grants: Record<Agent, readonly Label[]> = {
  assistant: LABELS,
  "financial-analyst": ["private", "finance"],
  "infrastructure-monitor": ["private", "infrastructure"],
  "security-analyst": ["private", "infrastructure"],
  "executive-planner": ["private", "finance", "work"],
};
const authority = Symbol("server-memory-authority");
export type Access = Readonly<{
  userId: string;
  agent: Agent;
  domains: readonly string[];
  labels: readonly Label[];
  operation: "read" | "manage";
  [authority]: true;
}>;
export class MemoryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function enabled() {
  return process.env.MEMORY_V2_ENABLED === "true";
}
export function domain(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(value))
    throw new MemoryError("Invalid memory scope.");
  return value;
}
// This factory is for authenticated server callers only. HTTP routes never accept agent/grants.
export function serverAccess(
  userId: string,
  agent: Agent = "assistant",
  domains: readonly string[] = [],
  operation: "read" | "manage" = "read",
): Access {
  if (
    !userId ||
    !Object.hasOwn(grants, agent) ||
    (operation === "manage" && agent !== "assistant")
  )
    throw new MemoryError("Memory access denied.", 403);
  if (domains.length > 12) throw new MemoryError("Too many scopes.");
  return Object.freeze({
    userId,
    agent,
    domains: Object.freeze([...new Set(domains.map(domain))].sort()),
    labels: grants[agent],
    operation,
    [authority]: true as const,
  });
}
export function assertAccess(access: Access, manage = false) {
  if (access[authority] !== true || (manage && access.operation !== "manage"))
    throw new MemoryError("Memory access denied.", 403);
}
export function normalize(text: string) {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}
export function digest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
export function contentHash(text: string) {
  return digest(normalize(text).toLowerCase());
}
export function hasSecrets(text: string) {
  return /-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{12,}|AKIA[A-Z0-9]{16}|gh[pousr]_[a-zA-Z0-9]{16,})|\b(?:password|passwd|api[ _-]?key|access[ _-]?token|secret|authorization|routing[ _-]?number|account[ _-]?number)\s*[:=]\s*\S+|\bBearer\s+\S+|https?:\/\/[^\s/]+:[^\s/]+@|\b\d{3}-\d{2}-\d{4}\b|\b(?:\d[ -]?){13,19}\b/i.test(
    text,
  );
}
export function safeText(value: unknown, max = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new MemoryError(`Text must contain 1–${max} characters.`);
  const text = normalize(value);
  if (hasSecrets(text))
    throw new MemoryError(
      "Remove credentials or account identifiers before saving memory.",
    );
  return text;
}
export function classifyLabels(scope: string, text: string): Label[] {
  const all = `${scope} ${text}`.toLowerCase();
  const labels: Label[] = ["private"];
  if (
    /financ|bank|duplex|real.estat|invest|purchas|budget|salary|spend|stock|crypto|mortgage/.test(
      all,
    )
  )
    labels.push("finance");
  if (/health|sleep|mood|fitness|medicat|diagnos|therapy|illness/.test(all))
    labels.push("health");
  if (/journal|diary/.test(all)) labels.push("journal");
  if (
    /server|infrastruct|homelab|security|ssh|firewall|backup|coding|laptop/.test(
      all,
    )
  )
    labels.push("infrastructure");
  if (/career|work|promotion|employer|business/.test(all)) labels.push("work");
  // Unknown project/topic lanes are confidential; specialized agents must not inherit them.
  if (scope !== "general" && labels.length === 1) labels.push("work");
  return labels;
}
export type Candidate = {
  type: MemoryType;
  domain: string;
  title: string;
  content: string;
  factKey: string | null;
  assertion:
    | "user_stated"
    | "unverified"
    | "verified_application"
    | "agent_observation"
    | "model_inference";
  extractionMethod: string;
  importance: number;
  correction: boolean;
};
export function validateCandidate(value: Candidate): Candidate {
  if (
    !TYPES.includes(value.type) ||
    ![
      "user_stated",
      "unverified",
      "verified_application",
      "agent_observation",
      "model_inference",
    ].includes(value.assertion)
  )
    throw new MemoryError("Invalid memory classification.");
  if (
    !Number.isInteger(value.importance) ||
    value.importance < 1 ||
    value.importance > 5
  )
    throw new MemoryError("Invalid importance.");
  return {
    ...value,
    domain: domain(value.domain),
    title: safeText(value.title, 120),
    content: safeText(value.content),
    factKey: value.factKey ? safeText(value.factKey, 160) : null,
  };
}
export function extractUserStatement(text: string, scope: string): Candidate[] {
  // A deliberately narrow grammar; no assistant output or model speculation enters here.
  if (text.length > 8000 || hasSecrets(text)) return [];
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).slice(0, 30);
  return sentences
    .flatMap((sentence): Candidate[] => {
      const content = normalize(sentence);
      if (
        content.length < 10 ||
        content.length > 1500 ||
        /\?$/.test(content) ||
        !/^(?:remember(?: that)?\b|my (?:goal|preference|plan)\b|i (?:prefer|plan|decided|postponed|no longer|now)\b|we (?:decided|agreed|completed)\b|correction:|the .{1,60} (?:fixed|resolved)\b)/i.test(
          content,
        )
      )
        return [];
      const correction =
        /^(?:correction:|i (?:postponed|no longer|now))\b/i.test(content) ||
        /^correction:/i.test(content);
      let factKey: string | null = null;
      if (/duplex/i.test(content) && /purchas|buy|postpon|plan/i.test(content))
        factKey = "plan:duplex-purchase";
      else if (/^i prefer\b/i.test(content))
        factKey = `preference:${content.toLowerCase().match(/prefer\s+(?:a\s+)?(\w+)/)?.[1] ?? "unknown"}`;
      else if (/^my goal\b/i.test(content)) factKey = `goal:${scope}`;
      const type = /fixed|resolved|steps worked/i.test(content)
        ? "procedural"
        : /decided|agreed|completed|postponed/i.test(content)
          ? "episodic"
          : "semantic";
      return [
        validateCandidate({
          type,
          domain: scope,
          title: content.slice(0, 100),
          content,
          factKey,
          assertion: "user_stated",
          extractionMethod: "rules-v2",
          importance: correction ? 4 : 3,
          correction,
        }),
      ];
    })
    .slice(0, 4);
}
// UTF-8 bytes are a conservative bound, not a provider tokenizer claim.
export function tokens(text: string) {
  return Buffer.byteLength(text, "utf8");
}
export function clip(text: string, budget: number) {
  if (budget <= 0) return "";
  let result = "",
    used = 0;
  for (const char of text) {
    const size = tokens(char);
    if (used + size > budget) break;
    result += char;
    used += size;
  }
  return result;
}

export function disclosureAccess(
  access: Access,
  labels: readonly string[],
): Access {
  assertAccess(access);
  return Object.freeze({
    ...access,
    labels: Object.freeze(access.labels.filter((l) => labels.includes(l))),
  });
}
