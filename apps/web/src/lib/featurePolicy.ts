import type { Rollout } from "./admin/policy.ts";
export type FeatureStage = Rollout | "OFF";
const rank: Record<Rollout, number> = { STABLE: 0, BETA: 1, EXPERIMENTAL: 2 };
export function featureAllows(rollout: unknown, stage: unknown): boolean {
  if (stage === "OFF" || !Object.hasOwn(rank, String(stage)) || !Object.hasOwn(rank, String(rollout))) return false;
  return rank[rollout as Rollout] >= rank[stage as Rollout];
}
