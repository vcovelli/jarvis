import { OperationsError } from "./policy";
export async function readOperationsBody(
  request: Request,
  limit = 16000,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new OperationsError("Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new OperationsError("JSON body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new OperationsError("Request too large.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new OperationsError("Invalid JSON.");
  }
}
