import "server-only";
import { randomUUID } from "node:crypto";
import packageInfo from "../../package.json";
const runtime = globalThis as typeof globalThis & { jarvisRuntimeVersion?: string };
export function getRuntimeVersion() { return runtime.jarvisRuntimeVersion ??= randomUUID(); }
export function getBuildInfo() {
  const stamp = process.env.BUILD_TIMESTAMP;
  return {
    version: process.env.APP_VERSION?.trim().slice(0, 80) || packageInfo.version || null,
    commit: /^[a-f0-9]{7,40}$/i.test(process.env.GIT_COMMIT_SHA ?? "") ? process.env.GIT_COMMIT_SHA! : null,
    builtAt: stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : null,
    environment: process.env.NODE_ENV ?? "development",
  };
}
