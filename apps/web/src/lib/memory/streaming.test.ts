import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
// Node 22.15 runtime; this repository still uses the Node 20 declaration package.
type Resolution = { url: string; shortCircuit?: boolean };
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => Resolution,
    ) => Resolution;
  }) => { deregister: () => void };
};
// Test-only server marker shim. Production imports and gateway authorization are unchanged.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only")
      return {
        url: "data:text/javascript,export%20%7B%7D",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
process.env.OPENCLAW_CONFIG_PATH = "/tmp/jarvis-memory-v2-no-config";
process.env.OPENCLAW_DEVICE_IDENTITY_PATH = "/tmp/jarvis-memory-v2-no-identity";
process.env.OPENCLAW_GATEWAY_TOKEN = "synthetic-test-token";
process.env.OPENCLAW_GATEWAY_URL = "ws://127.0.0.1:1";
const { streamOpenClawChat } = await import("../openclaw/client.ts");
hooks.deregister();

test("existing OpenClaw transport preserves accepted/delta/final streaming and chosen session", async () => {
  const original = globalThis.WebSocket;
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  class MockSocket extends EventTarget {
    readyState = 1;
    constructor() {
      super();
      queueMicrotask(() =>
        this.emit({
          type: "event",
          event: "connect.challenge",
          payload: { nonce: "test-nonce" },
        }),
      );
    }
    emit(value: unknown) {
      this.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(value) }),
      );
    }
    send(raw: string) {
      const frame = JSON.parse(raw);
      requests.push(frame);
      queueMicrotask(() => {
        this.emit({ type: "res", id: frame.id, ok: true, payload: {} });
        if (frame.method === "chat.send") {
          const runId = frame.params.idempotencyKey;
          this.emit({
            type: "event",
            event: "chat",
            payload: {
              runId: "other-run",
              state: "delta",
              deltaText: "must not leak",
            },
          });
          this.emit({
            type: "event",
            event: "chat",
            payload: { runId, state: "delta", deltaText: "Saved " },
          });
          this.emit({
            type: "event",
            event: "chat",
            payload: { runId, state: "delta", deltaText: "evidence" },
          });
          this.emit({
            type: "event",
            event: "chat",
            payload: {
              runId,
              state: "final",
              message: { content: [{ type: "text", text: "Saved evidence" }] },
            },
          });
        }
      });
    }
    close() {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  }
  globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
  try {
    const deltas: string[] = [];
    let accepted = 0,
      finals = 0;
    const result = await streamOpenClawChat({
      userId: "user-a",
      sessionKey: "agent:main:jarvis-memory-v2:fixture",
      message: "Bounded evidence",
      handlers: {
        onAccepted: () => accepted++,
        onDelta: (p) => deltas.push(p.text),
        onFinal: () => finals++,
      },
    });
    assert.equal(result.text, "Saved evidence");
    assert.equal(accepted, 1);
    assert.equal(finals, 1);
    assert.deepEqual(deltas, ["Saved ", "evidence"]);
    assert.equal(
      requests.find((r) => r.method === "chat.send")?.params.sessionKey,
      "agent:main:jarvis-memory-v2:fixture",
    );
    assert.equal(
      requests.find((r) => r.method === "sessions.messages.subscribe")?.params
        .key,
      "agent:main:jarvis-memory-v2:fixture",
    );
  } finally {
    globalThis.WebSocket = original;
  }
});
