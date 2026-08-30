import "server-only";

import { createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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
  sessionKey?: string;
  signal?: AbortSignal;
  handlers?: OpenClawChatHandlers;
}): Promise<{ text: string; runId: string; sessionKey: string }> {
  const agentId = normalizeOpenClawAgentId(process.env.OPENCLAW_AGENT_ID ?? "main");
  const sessionKey = params.sessionKey ?? buildOpenClawSessionKey(params.userId, agentId);
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
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || loadConfiguredGatewayToken() || undefined;
  const password = process.env.OPENCLAW_GATEWAY_PASSWORD?.trim() || undefined;
  const auth = token || password ? { token, password } : undefined;
  const role = process.env.OPENCLAW_GATEWAY_ROLE ?? "operator";
  const scopes = ["operator.admin"];
  const clientId = "gateway-client";
  const clientMode = "backend";
  const platform = process.platform;
  const deviceIdentity = loadOpenClawDeviceIdentity();
  const signedAtMs = Date.now();

  return {
    minProtocol: 4,
    maxProtocol: 4,
    client: {
      id: clientId,
      displayName: "Jarvis assistant",
      version: "jarvis-web",
      platform,
      mode: clientMode,
    },
    caps: [],
    auth,
    role,
    scopes,
    ...(deviceIdentity
      ? {
          device: buildDeviceConnectParams({
            identity: deviceIdentity,
            clientId,
            clientMode,
            role,
            scopes,
            signedAtMs,
            signatureToken: token,
            nonce,
            platform,
          }),
        }
      : {}),
  };
}

type OpenClawDeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
};

function loadConfiguredGatewayToken() {
  try {
    const configuredPath = process.env.OPENCLAW_CONFIG_PATH?.trim();
    const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(homedir(), ".openclaw");
    const configPath = configuredPath || path.join(stateDir, "openclaw.json");
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const gateway = parsed.gateway && typeof parsed.gateway === "object" ? parsed.gateway as Record<string, unknown> : null;
    const auth = gateway?.auth && typeof gateway.auth === "object" ? gateway.auth as Record<string, unknown> : null;
    return typeof auth?.token === "string" && auth.token.trim() ? auth.token.trim() : undefined;
  } catch {
    return undefined;
  }
}

function loadOpenClawDeviceIdentity(): OpenClawDeviceIdentity | null {
  try {
    const configuredPath = process.env.OPENCLAW_DEVICE_IDENTITY_PATH?.trim();
    const stateDir = process.env.OPENCLAW_STATE_DIR?.trim() || path.join(homedir(), ".openclaw");
    const identityPath = configuredPath || path.join(stateDir, "identity", "device.json");
    const parsed = JSON.parse(readFileSync(identityPath, "utf8")) as Record<string, unknown>;
    if (
      parsed.version !== 1 ||
      typeof parsed.deviceId !== "string" ||
      typeof parsed.publicKeyPem !== "string" ||
      typeof parsed.privateKeyPem !== "string"
    ) {
      return null;
    }
    return {
      deviceId: parsed.deviceId,
      publicKeyPem: parsed.publicKeyPem,
      privateKeyPem: parsed.privateKeyPem,
    };
  } catch {
    return null;
  }
}

function buildDeviceConnectParams(params: {
  identity: OpenClawDeviceIdentity;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  signatureToken?: string;
  nonce: string;
  platform: string;
}) {
  const payload = [
    "v3",
    params.identity.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.signatureToken ?? "",
    params.nonce,
    params.platform,
    "",
  ].join("|");

  return {
    id: params.identity.deviceId,
    publicKey: publicKeyRawBase64UrlFromPem(params.identity.publicKeyPem),
    signature: base64UrlEncode(sign(null, Buffer.from(payload, "utf8"), createPrivateKey(params.identity.privateKeyPem))),
    signedAt: params.signedAtMs,
    nonce: params.nonce,
  };
}

function publicKeyRawBase64UrlFromPem(publicKeyPem: string) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  const raw = der.length === prefix.length + 32 && der.subarray(0, prefix.length).equals(prefix)
    ? der.subarray(prefix.length)
    : der;
  return base64UrlEncode(raw);
}

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
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
