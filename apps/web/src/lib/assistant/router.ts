import type { AssistantIntentResult } from "@/lib/assistantIntent";

export type AssistantRouteKind = "intent" | "status" | "openclaw";

const STRUCTURED_INTENTS = new Set([
  "log_mood",
  "add_journal",
  "add_todo",
  "log_sleep",
  "update_todo",
  "complete_todo",
  "insight",
  "clarify",
]);

export function classifyAssistantMessage(input: string, intent: AssistantIntentResult): AssistantRouteKind {
  if (STRUCTURED_INTENTS.has(intent.kind)) return "intent";
  if (isJarvisStatusRequest(input)) return "status";
  return "openclaw";
}

export function isJarvisStatusRequest(input: string) {
  const lower = input.toLowerCase();
  const asksForStatus = /\b(status|health|snapshot|monitoring|metrics|uptime|storage|disk|services?)\b/.test(lower);
  const target = /\b(jarvis|homelab|server|box|host|prometheus|grafana|service|services|system)\b/.test(lower);
  return asksForStatus && target;
}
