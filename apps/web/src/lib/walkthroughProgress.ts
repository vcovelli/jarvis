import { findGuide, userGuides } from "./userGuides.ts";

export const WALKTHROUGH_REPLAY_EVENT = "jarvis-first-run-walkthrough-replay";
export const LEGACY_WALKTHROUGH_KEY = "jarvis-first-run-walkthrough-complete-v1";
export const REMINDER_DELAY_MS = 7 * 24 * 60 * 60 * 1000;
export type GuideStatus = "in-progress" | "skipped" | "completed" | "dismissed";
export type GuideProgress = { status: GuideStatus; step: number; updatedAt: number; remindAfter: number; neverSuggest: boolean };
export type WalkthroughProgress = {
  version: 2;
  welcomed: boolean;
  neverPrompt: boolean;
  lastPromptAt: number;
  guides: Record<string, GuideProgress>;
};

export function walkthroughKey(userId: string, demo: boolean): string {
  return "jarvis-walkthrough-v2:" + encodeURIComponent(userId) + ":" + (demo ? "demo" : "personal");
}

export function freshProgress(welcomed = false): WalkthroughProgress {
  return { version: 2, welcomed, neverPrompt: false, lastPromptAt: 0, guides: {} };
}

export function parseProgress(raw: string | null, legacyComplete = false): WalkthroughProgress {
  const result = freshProgress(legacyComplete);
  if (!raw) return result;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 2 || typeof data !== "object") return result;
    result.welcomed = data.welcomed === true;
    result.neverPrompt = data.neverPrompt === true;
    result.lastPromptAt = validTime(data.lastPromptAt);
    for (const guide of userGuides) {
      const entry = data.guides?.[guide.id];
      if (!entry || !["in-progress", "skipped", "completed", "dismissed"].includes(entry.status)) continue;
      result.guides[guide.id] = {
        status: entry.status,
        neverSuggest: entry.neverSuggest === true || entry.status === "dismissed",
        step: clampStep(guide.id, entry.step),
        updatedAt: validTime(entry.updatedAt),
        remindAfter: validTime(entry.remindAfter),
      };
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
  if (!findGuide(id)) return progress;
  return {
    ...progress,
    welcomed: true,
    lastPromptAt: now,
    guides: {
      ...progress.guides,
      [id]: { step: clampStep(id, step), status, updatedAt: now, remindAfter: now + REMINDER_DELAY_MS, neverSuggest: status === "dismissed" || progress.guides[id]?.neverSuggest === true || progress.guides[id]?.status === "dismissed" },
    },
  };
}

export function resumeStep(progress: WalkthroughProgress, id: string): number {
  const entry = progress.guides[id];
  return entry && ["in-progress", "skipped"].includes(entry.status) ? clampStep(id, entry.step) : 0;
}

export function shouldSuggest(progress: WalkthroughProgress, id: string, now: number): boolean {
  if (!progress.welcomed || progress.neverPrompt || !findGuide(id)) return false;
  if (progress.lastPromptAt && now < progress.lastPromptAt + REMINDER_DELAY_MS) return false;
  const entry = progress.guides[id];
  if (!entry) return true;
  if (entry.neverSuggest) return false;
  return ["in-progress", "skipped"].includes(entry.status) && now >= entry.remindAfter;
}

function validTime(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
