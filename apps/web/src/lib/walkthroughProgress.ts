import { findGuide, userGuides } from "./userGuides.ts";

export type GuideStatus = "in-progress" | "skipped" | "completed" | "dismissed";
export type GuideProgress = { status: GuideStatus; step: number; stepId: string; updatedAt: number };
export type WalkthroughProgress = {
  version: 2;
  welcomed: boolean;
  guides: Record<string, GuideProgress>;
};

export function walkthroughKey(userId: string, demo: boolean): string {
  return "jarvis-walkthrough-v2:" + encodeURIComponent(userId) + ":" + (demo ? "demo" : "personal");
}

export function freshProgress(welcomed = false): WalkthroughProgress {
  return { version: 2, welcomed, guides: {} };
}

// Preserve a returning user's place when quick start grows.
const legacyEssentialsSteps = ["theme-start", "must-win-start", "todos-start", "habits-start", "sleep-start", "mood-start"];

export function parseProgress(raw: string | null): WalkthroughProgress {
  const result = freshProgress();
  if (!raw) return result;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 2 || typeof data !== "object") return result;
    result.welcomed = data.welcomed === true || data.neverPrompt === true;
    for (const guide of userGuides) {
      const entry = data.guides?.[guide.id];
      if (!entry || !["in-progress", "skipped", "completed", "dismissed"].includes(entry.status)) continue;
      const stepId = entry.stepId ?? (guide.id === "essentials" ? legacyEssentialsSteps[entry.step] : undefined);
      const index = guide.steps.findIndex((step) => step.id === stepId);
      const step = index >= 0 ? index : clampStep(guide.id, entry.step);
      result.guides[guide.id] = {
        status: entry.status, step, stepId: guide.steps[step].id,
        updatedAt: typeof entry.updatedAt === "number" && Number.isFinite(entry.updatedAt) && entry.updatedAt >= 0 ? entry.updatedAt : 0,
      };
      result.welcomed = true;
    }
  } catch {
    // Corrupt or unavailable storage must not prevent use of the app.
  }
  return result;
}

export function clampStep(id: string, step: number): number {
  return Math.max(0, Math.min(Number.isFinite(step) ? Math.floor(step) : 0, (findGuide(id)?.steps.length ?? 1) - 1));
}

export function recordGuide(
  progress: WalkthroughProgress, id: string, step: number, status: GuideStatus, now: number,
): WalkthroughProgress {
  const guide = findGuide(id);
  if (!guide) return progress;
  const index = clampStep(id, step);
  return {
    ...progress, welcomed: true,
    guides: { ...progress.guides, [id]: { step: index, stepId: guide.steps[index].id, status, updatedAt: now } },
  };
}

export function resumeStep(progress: WalkthroughProgress, id: string): number {
  const entry = progress.guides[id];
  return entry && ["in-progress", "skipped"].includes(entry.status) ? clampStep(id, entry.step) : 0;
}

/** Only a new personal workspace gets an automatic welcome. All replay is manual. */
export function shouldWelcome(progress: WalkthroughProgress, demo: boolean): boolean {
  return !demo && !progress.welcomed && Object.keys(progress.guides).length === 0;
}
