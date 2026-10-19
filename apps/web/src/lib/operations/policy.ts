import { createHash } from "node:crypto";

export const domains = [
  "infrastructure",
  "finance",
  "business",
  "security",
  "executive",
  "strategy",
] as const;
export type Domain = (typeof domains)[number];
export const cadence: Record<Domain, number> = {
  infrastructure: 30 * 60_000,
  security: 30 * 60_000,
  finance: 86400_000,
  business: 86400_000,
  executive: 86400_000,
  strategy: 7 * 86400_000,
};
export const MAX_ATTEMPTS = 3;
export const MAX_RUNTIME_MS = 20_000;
export const LEASE_MS = 45_000;
export type Action = {
  kind: "observe.recheck";
  domain: Domain;
  decisionId: string;
};
export class OperationsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new OperationsError("Expected an object.");
  return value as Record<string, unknown>;
}
export function parseAction(value: unknown): Action {
  const a = object(value);
  if (
    Object.keys(a).sort().join() !== "decisionId,domain,kind" ||
    a.kind !== "observe.recheck" ||
    !domains.includes(a.domain as Domain) ||
    typeof a.decisionId !== "string" ||
    !a.decisionId ||
    a.decisionId.length > 100
  )
    throw new OperationsError(
      "Action is outside the V1 execution allowlist.",
      403,
    );
  return { kind: a.kind, domain: a.domain as Domain, decisionId: a.decisionId };
}
export function actionDigest(value: unknown, expiresAt: Date) {
  const a = parseAction(value);
  return createHash("sha256")
    .update(
      JSON.stringify([a.kind, a.domain, a.decisionId, expiresAt.toISOString()]),
    )
    .digest("hex");
}
export function verifyApproval(
  value: unknown,
  digest: string,
  expiresAt: Date,
  now = new Date(),
) {
  if (expiresAt <= now || actionDigest(value, expiresAt) !== digest)
    throw new OperationsError(
      "Approval expired or the exact action changed.",
      409,
    );
  return parseAction(value);
}
export function energyCost(durationMs: number, watts: number, rate: number) {
  if (![durationMs, watts, rate].every((v) => Number.isFinite(v) && v >= 0))
    throw new OperationsError("Invalid energy assumptions.");
  return (((durationMs / 3_600_000) * watts) / 1000) * rate;
}
export function budgetAllows(
  reserve: number,
  perJob: number,
  dayUsed: number,
  daily: number,
  monthUsed: number,
  monthly: number,
) {
  return (
    [reserve, perJob, dayUsed, daily, monthUsed, monthly].every(
      (v) => Number.isFinite(v) && v >= 0,
    ) &&
    reserve <= perJob &&
    dayUsed + reserve <= daily &&
    monthUsed + reserve <= monthly
  );
}
export type Preferences = {
  financialGoals: string;
  liquidityUsd: number;
  investmentHorizon: string;
  riskTolerance: string;
  businessPriorities: string;
  reliability: string;
  monthlySpendingUsd: number;
  temporary: string;
  temporaryExpiresAt: string | null;
  timezone: string;
  quietStart: number;
  quietEnd: number;
  approvalRequirements: "Every consequential action requires separate approval";
};
export const defaultPreferences: Preferences = {
  financialGoals: "Not specified",
  liquidityUsd: 0,
  investmentHorizon: "Not specified",
  riskTolerance: "Not specified",
  businessPriorities: "Not specified",
  reliability: "Notify on degradation",
  monthlySpendingUsd: 0,
  temporary: "",
  temporaryExpiresAt: null,
  timezone: "America/New_York",
  quietStart: 22,
  quietEnd: 8,
  approvalRequirements: "Every consequential action requires separate approval",
};
export function parsePreferences(
  value: unknown,
  now = new Date(),
): Preferences {
  const v = object(value);
  if (Object.keys(v).some((k) => !(k in defaultPreferences)))
    throw new OperationsError("Unknown preference.");
  const p = { ...defaultPreferences, ...v } as Preferences;
  for (const k of [
    "financialGoals",
    "investmentHorizon",
    "riskTolerance",
    "businessPriorities",
    "reliability",
    "temporary",
  ] as const)
    if (typeof p[k] !== "string" || p[k].length > 1000)
      throw new OperationsError(`Invalid ${k}.`);
  for (const k of ["liquidityUsd", "monthlySpendingUsd"] as const)
    if (!Number.isFinite(p[k]) || p[k] < 0 || p[k] > 1e9)
      throw new OperationsError(`Invalid ${k}.`);
  if (
    ![p.quietStart, p.quietEnd].every(
      (v) => Number.isInteger(v) && v >= 0 && v <= 23,
    )
  )
    throw new OperationsError("Invalid quiet hours.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: p.timezone }).format(now);
  } catch {
    throw new OperationsError("Invalid timezone.");
  }
  if (
    p.temporary &&
    (!p.temporaryExpiresAt ||
      !Number.isFinite(Date.parse(p.temporaryExpiresAt)) ||
      Date.parse(p.temporaryExpiresAt) <= +now ||
      Date.parse(p.temporaryExpiresAt) > +now + 90 * 86400_000)
  )
    throw new OperationsError(
      "Temporary preferences need an expiry within 90 days.",
    );
  p.approvalRequirements = defaultPreferences.approvalRequirements;
  return p;
}
export function effectivePreferences(
  value: unknown,
  now = new Date(),
): Preferences {
  const p = { ...defaultPreferences, ...object(value) } as Preferences;
  if (!p.temporaryExpiresAt || Date.parse(p.temporaryExpiresAt) <= +now)
    p.temporary = "";
  return p;
}
export function notificationTime(now: Date, p: Preferences): Date {
  // Iterate actual instants to handle overnight windows and DST transitions.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: p.timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
  let at = new Date(now);
  for (let i = 0; i < 26 * 60; i++) {
    const hour = Number(formatter.format(at));
    const quiet =
      p.quietStart === p.quietEnd
        ? false
        : p.quietStart < p.quietEnd
          ? hour >= p.quietStart && hour < p.quietEnd
          : hour >= p.quietStart || hour < p.quietEnd;
    if (!quiet) return at;
    at = new Date(+at + 60_000);
  }
  return at;
}
export function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
