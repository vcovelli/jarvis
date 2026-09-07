import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getClientIp, getUserAgent } from "@/lib/requestSecurity";

const secretKeyPattern = /(password|token|secret|authorization|cookie|credential|api[-_]?key)/i;

export function sanitizeAuditMetadata(value: unknown): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.slice(0, 100).map(walk);
    if (!input || typeof input !== "object") {
      if (typeof input === "string") return input.slice(0, 1000);
      return input;
    }
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([key]) => !secretKeyPattern.test(key))
        .slice(0, 100)
        .map(([key, item]) => [key, walk(item)]),
    );
  };
  return walk(value) as Prisma.InputJsonValue;
}

export async function writeAuditLog(params: {
  action: string;
  outcome?: "success" | "failure" | "denied";
  userId?: string | null;
  request?: Request | { headers?: Headers | Record<string, string | string[] | undefined> };
  metadata?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        outcome: params.outcome ?? "success",
        ipAddress: params.request ? getClientIp(params.request) : undefined,
        userAgent: params.request ? getUserAgent(params.request) : undefined,
        metadata: sanitizeAuditMetadata(params.metadata),
      },
    });
  } catch (error) {
    console.error("[audit] write_failed", { action: params.action, errorType: error instanceof Error ? error.name : "UnknownError" });
  }
}
