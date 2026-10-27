import "server-only";
import { NextResponse } from "next/server";
import { MemoryError } from "./policy";
export const privateHeaders = { "Cache-Control": "private, no-store" };
export function memoryFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof MemoryError
          ? error.message
          : "Memory service unavailable.",
    },
    {
      status: error instanceof MemoryError ? error.status : 503,
      headers: privateHeaders,
    },
  );
}
export async function readMemoryBody(
  request: Request,
  limit = 16000,
): Promise<Record<string, unknown>> {
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (
    request.headers.get("origin") !== expected ||
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    throw new MemoryError("Same-origin JSON request required.", 403);
  if (Number(request.headers.get("content-length")) > limit)
    throw new MemoryError("Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new MemoryError("JSON body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new MemoryError("Request too large.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MemoryError("Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new MemoryError("JSON object required.");
  return parsed;
}
