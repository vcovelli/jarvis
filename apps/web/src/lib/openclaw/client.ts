import "server-only";

import { randomUUID } from "node:crypto";

const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:18789";
const CONNECT_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const CHAT_TIMEOUT_MS = 120000;
const OPEN = 1;

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
};

type GatewayEventFrame = {
  type: "event";
  event: string;
  seq?: number;
  payload?: unknown;
};

type PendingRequest = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type OpenClawChatMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type OpenClawChatPayload = {
  runId?: string;
  sessionKey?: string;
  agentId?: string;
  state?: "delta" | "final" | "aborted" | "error";
  deltaText?: string;
  replace?: boolean;
  errorMessage?: string;
  message?: OpenClawChatMessage;
};

export type OpenClawChatHandlers = {
  onAccepted?: (payload: { runId: string; sessionKey: string }) => void;
  onDelta?: (payload: { text: string; replace?: boolean }) => void;
  onFinal?: (payload: { text: string; state: "final" | "aborted" }) => void;
};

export async function streamOpenClawChat(params: {
  userId: string;
  message: string;
  signal?: AbortSignal;
  handlers?: OpenClawChatHandlers;
}): Promise<{ text: string; runId: string; sessionKey: string }> {
  const agentId = normalizeOpenClawAgentId(process.env.OPENCLAW_AGENT_ID ?? "main");
  const sessionKey = buildOpenClawSessionKey(params.userId, agentId);
  const runId = randomUUID();
  let accumulatedText = "";
  let settled = false;
  let terminalError: Error | null = null;

  const client = await connectGateway({
    signal: params.signal,
    onEvent: (event) => {
      if (event.event !== "chat") return;
      const payload = coerceChatPayload(event.payload);
      if (!payload || payload.runId !== runId) return;

      if (payload.state === "delta") {
        const text = payload.deltaText ?? "";
        if (!text) return;
        accumulatedText = payload.replace ? text : `${accumulatedText}${text}`;
        params.handlers?.onDelta?.({ text, replace: payload.replace });
        return;
      }

      if (payload.state === "final" || payload.state === "aborted") {
        const finalText = extractMessageText(payload.message) || accumulatedText;
        if (finalText) accumulatedText = finalText;
        params.handlers?.onFinal?.({ text: accumulatedText, state: payload.state });
        settled = true;
        return;
      }

      if (payload.state === "error") {
        settled = true;
        terminalError = new Error(payload.errorMessage || extractMessageText(payload.message) || "OpenClaw returned an error.");
      }
    },
  });

  try {
    await client.request("sessions.messages.subscribe", { key: sessionKey, agentId }, { signal: params.signal });
    params.handlers?.onAccepted?.({ runId, sessionKey });

    await client.request(
      "chat.send",
      {
        sessionKey,
        agentId,
        message: params.message,
        idempotencyKey: runId,
      },
      { signal: params.signal },
    );

    await waitForChatCompletion(() => settled, params.signal);
    if (terminalError) throw terminalError;
    return { text: accumulatedText, runId, sessionKey };
  } finally {
    client.close();
  }
}

export async function checkOpenClawHealth(): Promise<{ ok: boolean; error?: string }> {
  const healthUrl = gatewayUrlToHttpUrl(resolveGatewayUrl(), "/health");
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { ok: false, error: `OpenClaw health returned ${response.status}` };
    const data = await response.json().catch(() => null);
    return { ok: Boolean(data?.ok), error: data?.ok ? undefined : "OpenClaw health was not ok." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function connectGateway(params: {
  signal?: AbortSignal;
  onEvent: (event: GatewayEventFrame) => void;
}) {
  const url = resolveGatewayUrl();
  const ws = new WebSocket(url);
  const pending = new Map<string, PendingRequest>();
  let connected = false;
  let closed = false;

  const close = () => {
    closed = true;
    for (const [, request] of pending) {
      clearTimeout(request.timeout);
      request.reject(new Error("OpenClaw gateway connection closed."));
    }
    pending.clear();
    if (ws.readyState === OPEN || ws.readyState === 0) ws.close();
  };

  const request = (method: string, requestParams: unknown, options: { signal?: AbortSignal; timeoutMs?: number } = {}) => {
    if (ws.readyState !== OPEN) return Promise.reject(new Error("OpenClaw gateway is not connected."));
    const id = randomUUID();
    const timeout = setTimeout(() => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      entry.reject(new Error(`OpenClaw gateway request timed out for ${method}.`));
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);

    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject, timeout });
      options.signal?.addEventListener(
        "abort",
        () => {
          const entry = pending.get(id);
          if (!entry) return;
          pending.delete(id);
          clearTimeout(entry.timeout);
          entry.reject(new Error("OpenClaw gateway request aborted."));
        },
        { once: true },
      );
    });

    ws.send(JSON.stringify({ type: "req", id, method, params: requestParams }));
    return promise;
  };

  params.signal?.addEventListener("abort", close, { once: true });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out connecting to OpenClaw gateway."));
      close();
    }, CONNECT_TIMEOUT_MS);

    ws.addEventListener("message", (event) => {
      const frame = parseGatewayFrame(event.data);
      if (!frame) return;

      if (frame.type === "event") {
        if (frame.event === "connect.challenge") {
          const nonce = coerceNonce(frame.payload);
          if (!nonce) {
            reject(new Error("OpenClaw gateway connect challenge did not include a nonce."));
            close();
            return;
          }
          request("connect", buildConnectParams(nonce), { timeoutMs: CONNECT_TIMEOUT_MS })
            .then(() => {
              connected = true;
              clearTimeout(timeout);
              resolve();
            })
            .catch((error) => {
              clearTimeout(timeout);
              reject(error);
              close();
            });
          return;
        }
        params.onEvent(frame);
        return;
      }

      const entry = pending.get(frame.id);
      if (!entry) return;
      pending.delete(frame.id);
      clearTimeout(entry.timeout);
      if (frame.ok) entry.resolve(frame.payload);
      else entry.reject(new Error(frame.error?.message ?? "OpenClaw gateway request failed."));
    });

    ws.addEventListener("error", () => {
      if (connected) return;
      clearTimeout(timeout);
      reject(new Error("Could not connect to OpenClaw gateway."));
    });

    ws.addEventListener("close", () => {
      if (closed) return;
      closed = true;
      if (!connected) {
        clearTimeout(timeout);
        reject(new Error("OpenClaw gateway closed before handshake completed."));
      }
      for (const [, entry] of pending) {
        clearTimeout(entry.timeout);
        entry.reject(new Error("OpenClaw gateway connection closed."));
      }
      pending.clear();
    });
  });

  return { request, close };
}

function buildConnectParams(nonce: string) {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || undefined;
  const password = process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() || undefined;
  const auth = token || password ? { token, password } : undefined;

  return {
    minProtocol: 4,
    maxProtocol: 4,
    client: {
      id: "gateway-client",
      displayName: "Jarvis assistant",
      version: "jarvis-web",
      platform: process.platform,
      mode: "backend",
    },
    caps: [],
    auth,
    role: process.env.OPENCLAW_GATEWAY_ROLE ?? "operator",
    scopes: ["operator.admin"],
    nonce,
  };
}

function resolveGatewayUrl() {
  const raw = process.env.OPENCLAW_GATEWAY_URL?.trim() || DEFAULT_GATEWAY_URL;
  if (raw.startsWith("http://")) return `ws://${raw.slice("http://".length)}`;
  if (raw.startsWith("https://")) return `wss://${raw.slice("https://".length)}`;
  return raw;
}

function gatewayUrlToHttpUrl(rawUrl: string, pathname: string) {
  const url = new URL(rawUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = pathname;
  url.search = "";
  return url.toString();
}

function buildOpenClawSessionKey(userId: string, agentId: string) {
  const configured = process.env.OPENCLAW_SESSION_KEY?.trim();
  if (configured) return configured;
  const userSlug = userId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `agent:${agentId}:jarvis:${userSlug || "user"}`;
}

function normalizeOpenClawAgentId(agentId: string) {
  return agentId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "main";
}

function parseGatewayFrame(data: unknown): GatewayResponseFrame | GatewayEventFrame | null {
  try {
    const text =
      typeof data === "string"
        ? data
        : data instanceof ArrayBuffer
          ? new TextDecoder().decode(data)
          : ArrayBuffer.isView(data)
            ? new TextDecoder().decode(data)
            : String(data);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.type === "res" && typeof parsed.id === "string" && typeof parsed.ok === "boolean") {
      return parsed as GatewayResponseFrame;
    }
    if (parsed.type === "event" && typeof parsed.event === "string") {
      return parsed as GatewayEventFrame;
    }
    return null;
  } catch {
    return null;
  }
}

function coerceNonce(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return typeof record.nonce === "string" && record.nonce.trim() ? record.nonce.trim() : undefined;
}

function coerceChatPayload(payload: unknown): OpenClawChatPayload | null {
  if (!payload || typeof payload !== "object") return null;
  return payload as OpenClawChatPayload;
}

function extractMessageText(message: OpenClawChatMessage | undefined) {
  if (!message || !Array.isArray(message.content)) return "";
  return message.content
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("");
}

function waitForChatCompletion(isSettled: () => boolean, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const tick = () => {
      if (signal?.aborted) {
        reject(new Error("OpenClaw chat request aborted."));
        return;
      }
      if (isSettled()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > CHAT_TIMEOUT_MS) {
        reject(new Error("OpenClaw chat request timed out."));
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}
