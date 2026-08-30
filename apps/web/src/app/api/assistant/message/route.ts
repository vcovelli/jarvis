import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import {
  appendAssistantMessage,
  buildOpenClawConversationInput,
  ensureAssistantConversation,
  updateAssistantAutoMemory,
  updateConversationSummary,
} from "@/lib/assistant/conversations";
import { classifyAssistantMessage } from "@/lib/assistant/router";
import { resolveAssistantIntent } from "@/lib/assistant/serverIntent";
import { authOptions } from "@/lib/auth";
import { getFreshHomelabSnapshot } from "@/lib/homelabDocs";
import { checkOpenClawHealth, streamOpenClawChat } from "@/lib/openclaw/client";
import { getMonitoringSummary } from "@/lib/prometheus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AssistantSseEvent = "accepted" | "delta" | "final" | "error" | "conversation";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json({ error: "Missing assistant input." }, { status: 400 });
  }

  const conversation = await ensureAssistantConversation({
    userId,
    conversationId: typeof body?.conversationId === "string" ? body.conversationId : undefined,
    domain: typeof body?.domain === "string" ? body.domain : undefined,
    seedText: input,
  });
  await appendAssistantMessage({
    userId,
    conversationId: conversation.id,
    role: "user",
    content: input,
    source: "user",
  });

  const resolved = await resolveAssistantIntent({
    userId,
    input,
    context: body?.context,
  });
  const route = classifyAssistantMessage(input, resolved.result);

  if (route === "intent") {
    const assistantMessage = buildIntentPersistenceMessage(resolved.result);
    await appendAssistantMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      content: assistantMessage,
      source: "intent",
      metadata: { kind: resolved.result.kind },
    });
    await updateConversationSummary({
      userId,
      conversationId: conversation.id,
      userMessage: input,
      assistantMessage,
    });
    await updateAssistantAutoMemory({
      userId,
      conversationId: conversation.id,
      userMessage: input,
      assistantMessage,
    });
    return NextResponse.json({
      mode: "intent",
      result: resolved.result,
      used: resolved.used,
      conversation: projectConversation(conversation),
    });
  }

  if (route === "status") {
    const message = await buildJarvisStatusMessage();
    await appendAssistantMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      content: message,
      source: "jarvis-status",
    });
    await updateConversationSummary({
      userId,
      conversationId: conversation.id,
      userMessage: input,
      assistantMessage: message,
    });
    await updateAssistantAutoMemory({
      userId,
      conversationId: conversation.id,
      userMessage: input,
      assistantMessage: message,
    });
    return NextResponse.json({
      mode: "message",
      message,
      used: "jarvis-status",
      conversation: projectConversation(conversation),
    });
  }

  const health = await checkOpenClawHealth();
  if (!health.ok) {
    const message = `I could not reach OpenClaw on the Jarvis server${health.error ? `: ${health.error}` : "."}`;
    await appendAssistantMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      content: message,
      source: "openclaw-unavailable",
    });
    await updateConversationSummary({
      userId,
      conversationId: conversation.id,
      userMessage: input,
      assistantMessage: message,
    });
    await updateAssistantAutoMemory({
      userId,
      conversationId: conversation.id,
      userMessage: input,
      assistantMessage: message,
    });
    return NextResponse.json({
      mode: "message",
      message,
      used: "openclaw-unavailable",
      conversation: projectConversation(conversation),
    });
  }

  const openClawMessage = await buildOpenClawConversationInput({
    userId,
    conversationId: conversation.id,
    userMessage: input,
    lifeContext: body?.context,
  });
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let finalSent = false;
      const send = (event: AssistantSseEvent, payload: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      send("conversation", { conversation: projectConversation(conversation) });
      request.signal.addEventListener("abort", close, { once: true });

      void streamOpenClawChat({
        userId,
        message: openClawMessage,
        sessionKey: conversation.openClawSessionKey,
        signal: request.signal,
        handlers: {
          onAccepted: (payload) => send("accepted", { runId: payload.runId }),
          onDelta: (payload) => send("delta", payload),
          onFinal: (payload) => {
            finalSent = true;
            send("final", payload);
          },
        },
      })
        .then(async (result) => {
          if (!finalSent) send("final", { text: result.text, state: "final" });
          await appendAssistantMessage({
            userId,
            conversationId: conversation.id,
            role: "assistant",
            content: result.text,
            source: "openclaw",
          });
          await updateConversationSummary({
            userId,
            conversationId: conversation.id,
            userMessage: input,
            assistantMessage: result.text,
          });
          await updateAssistantAutoMemory({
            userId,
            conversationId: conversation.id,
            userMessage: input,
            assistantMessage: result.text,
          });
          close();
        })
        .catch(async (error) => {
          const message = getErrorMessage(error);
          await appendAssistantMessage({
            userId,
            conversationId: conversation.id,
            role: "assistant",
            content: message,
            source: "openclaw-error",
          });
          send("error", { message });
          close();
        });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function buildIntentPersistenceMessage(result: { kind: string; summary: string; clarification?: string; assistantMessage?: string }) {
  if (result.kind === "insight") return result.assistantMessage ?? result.summary;
  if (result.kind === "clarify") return result.clarification ?? "I need one more detail.";
  if (result.kind === "unsupported") return result.clarification ?? "I can help with tasks, sleep, mood, journal, and insights.";
  return `I understood: ${result.summary}. Review the details and confirm before I save it.`;
}

function projectConversation(conversation: {
  id: string;
  title: string;
  domain: string;
  summary: string | null;
  pinned: boolean;
  archivedAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: conversation.id,
    title: conversation.title,
    domain: conversation.domain,
    summary: conversation.summary,
    pinned: conversation.pinned,
    archivedAt: conversation.archivedAt?.toISOString() ?? null,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

async function buildJarvisStatusMessage() {
  const [monitoringResult, homelabResult, openClawResult] = await Promise.allSettled([
    getMonitoringSummary(),
    getFreshHomelabSnapshot(),
    checkOpenClawHealth(),
  ]);

  const lines: string[] = [];

  if (monitoringResult.status === "fulfilled") {
    const monitoring = monitoringResult.value;
    lines.push(`Monitoring is ${monitoring.status}${monitoring.healthScore === null ? "" : ` (${monitoring.healthScore}/100)`}.`);
    lines.push(
      [
        formatMetric("CPU", monitoring.metrics.cpuUsagePercent, "%"),
        formatMetric("Memory", monitoring.metrics.memoryUsagePercent, "%"),
        formatMetric("Root disk", monitoring.metrics.rootDiskUsagePercent, "%"),
        formatMetric("HDD", monitoring.metrics.hddUsagePercent, "%"),
      ]
        .filter(Boolean)
        .join(", "),
    );
    if (monitoring.metrics.firingAlerts) {
      lines.push(`${monitoring.metrics.firingAlerts} alert${monitoring.metrics.firingAlerts === 1 ? "" : "s"} firing.`);
    }
  } else {
    lines.push(`Monitoring summary is unavailable: ${getErrorMessage(monitoringResult.reason)}`);
  }

  if (homelabResult.status === "fulfilled") {
    const snapshot = homelabResult.value;
    const active = snapshot.services.filter((service) => service.status === "active").length;
    lines.push(`${active}/${snapshot.services.length} homelab services are active.`);
    if (snapshot.attention.length) {
      lines.push(`Top attention item: ${snapshot.attention[0].title}.`);
    }
  } else {
    lines.push(`Homelab snapshot is unavailable: ${getErrorMessage(homelabResult.reason)}`);
  }

  if (openClawResult.status === "fulfilled") {
    lines.push(`OpenClaw gateway is ${openClawResult.value.ok ? "reachable" : "unreachable"}.`);
  }

  return lines.filter(Boolean).join(" ");
}

function formatMetric(label: string, value: number | null, suffix: string) {
  if (value === null) return "";
  return `${label} ${value.toFixed(1)}${suffix}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
