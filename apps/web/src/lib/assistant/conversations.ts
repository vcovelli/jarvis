import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const assistantDomains = [
  "general",
  "daily",
  "finance",
  "career",
  "work",
  "car",
  "real-estate",
  "crypto",
  "stock-strategy",
  "coding",
  "laptop",
  "server",
  "enterprise-engineering",
  "robot-arm",
  "raspberry-pi",
  "cnc",
  "health",
  "sleep",
  "fitness",
] as const;
export type AssistantDomain = (typeof assistantDomains)[number] | string;

export type AssistantConversationListItem = {
  id: string;
  title: string;
  domain: string;
  summary: string | null;
  description: string | null;
  pinned: boolean;
  archivedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type AssistantStoredMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  source: string;
  createdAt: string;
};

export type AssistantMemoryItem = {
  id: string;
  domain: string;
  key: string;
  value: string;
  source: string;
  confidence: number | null;
  createdAt: string;
  updatedAt: string;
};

export async function listAssistantConversations(userId: string): Promise<AssistantConversationListItem[]> {
  const conversations = await prisma.assistantConversation.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }, { updatedAt: "desc" }],
    take: 80,
    include: { _count: { select: { messages: true } } },
  });

  return conversations.map(projectAssistantConversation);
}

export async function getAssistantConversation(userId: string, conversationId: string) {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 160,
      },
    },
  });
  if (!conversation) return null;

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      domain: conversation.domain,
      summary: conversation.summary,
      description: conversation.description,
      pinned: conversation.pinned,
      archivedAt: conversation.archivedAt?.toISOString() ?? null,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount: conversation.messages.length,
    },
    messages: conversation.messages.map(projectMessage),
  };
}

export async function ensureAssistantConversation(params: {
  userId: string;
  conversationId?: string;
  domain?: string;
  seedText?: string;
  description?: string | null;
}) {
  if (params.conversationId) {
    const existing = await prisma.assistantConversation.findFirst({
      where: { id: params.conversationId, userId: params.userId },
    });
    if (existing) return existing;
  }

  const domain = normalizeAssistantDomain(params.domain);
  const title = deriveConversationTitle(params.seedText, domain);
  const openClawSessionKey = buildOpenClawConversationSessionKey({
    userId: params.userId,
    domain,
    title,
  });

  return prisma.assistantConversation.create({
    data: {
      userId: params.userId,
      title,
      domain,
      openClawSessionKey,
      description: normalizeDescription(params.description ?? null),
      lastMessageAt: new Date(),
    },
  });
}

export async function updateAssistantConversation(params: {
  userId: string;
  conversationId: string;
  title?: string;
  domain?: string;
  description?: string | null;
  pinned?: boolean;
  archived?: boolean;
}) {
  const existing = await prisma.assistantConversation.findFirst({
    where: { id: params.conversationId, userId: params.userId },
    select: { id: true },
  });
  if (!existing) return null;

  const updates: Prisma.AssistantConversationUpdateInput = {};
  if (params.title !== undefined) updates.title = normalizeTitle(params.title) || "New conversation";
  if (params.domain !== undefined) updates.domain = normalizeAssistantDomain(params.domain);
  if (params.description !== undefined) updates.description = normalizeDescription(params.description);
  if (params.pinned !== undefined) updates.pinned = params.pinned;
  if (params.archived !== undefined) updates.archivedAt = params.archived ? new Date() : null;

  return prisma.assistantConversation.update({
    where: { id: existing.id },
    data: updates,
    include: { _count: { select: { messages: true } } },
  });
}

export async function appendAssistantMessage(params: {
  userId: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  source?: string;
  metadata?: unknown;
}) {
  const content = params.content.trim();
  if (!content) return null;
  const [message] = await prisma.$transaction([
    prisma.assistantMessage.create({
      data: {
        userId: params.userId,
        conversationId: params.conversationId,
        role: params.role,
        content,
        source: params.source ?? "jarvis",
        tokenEstimate: estimateTokens(content),
        metadata: isJsonRecord(params.metadata) ? (params.metadata as Prisma.InputJsonObject) : undefined,
      },
    }),
    prisma.assistantConversation.updateMany({
      where: { id: params.conversationId, userId: params.userId },
      data: { lastMessageAt: new Date() },
    }),
  ]);
  return projectMessage(message);
}

export async function buildOpenClawConversationInput(params: {
  userId: string;
  conversationId: string;
  userMessage: string;
  lifeContext?: unknown;
}) {
  const [conversation, recentMessages, memories] = await Promise.all([
    prisma.assistantConversation.findFirst({ where: { id: params.conversationId, userId: params.userId } }),
    prisma.assistantMessage.findMany({
      where: { conversationId: params.conversationId, userId: params.userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.assistantMemory.findMany({
      where: { userId: params.userId },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
  ]);
  if (!conversation) return params.userMessage;

  const projectMemoryDomain = getAssistantProjectMemoryDomainForTopic(conversation.domain);
  const scopedMemories = memories.filter(
    (memory) => memory.domain === conversation.domain || memory.domain === projectMemoryDomain || memory.domain === "general",
  );
  const memoryBlock = scopedMemories.length
    ? scopedMemories.map((memory) => `- [${memory.domain}] ${memory.key}: ${memory.value}`).join("\n")
    : "- None pinned yet.";
  const transcript = recentMessages.reverse().map((message) => `${message.role}: ${message.content}`).join("\n");
  const lifeContextBlock = buildLifeContextBlock(params.lifeContext);

  return [
    "Jarvis conversation context follows. Use it as private context, not as text to quote back unless useful.",
    "Operating rule: act like a context-aware personal assistant, but ask for explicit user approval before external actions, financial moves, purchases, account changes, deletions, server changes, or anything irreversible. Offer concise approval requests with the intended action, likely impact, and what you need from the user.",
    "Memory scope rule: [general] memory is shared across projects and agents, [project-*] memory is shared across chats in that project, and topic memory is specific to the selected lane.",
    `Project: ${projectMemoryDomain.replace(/^project-/, "")}`,
    `Topic: ${conversation.domain}`,
    `Title: ${conversation.title}`,
    `User-facing description: ${conversation.description ?? "No description set."}`,
    `Conversation summary: ${conversation.summary ?? "No summary yet."}`,
    "Pinned project/topic memory:",
    memoryBlock,
    "Current Jarvis life data snapshot:",
    lifeContextBlock,
    "Recent Jarvis transcript:",
    transcript || "No prior stored messages.",
    "Current user message:",
    params.userMessage,
  ].join("\n\n");
}

export async function updateConversationSummary(params: {
  userId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: params.conversationId, userId: params.userId },
    select: { summary: true, title: true },
  });
  if (!conversation) return;

  const summary = buildRollingSummary({
    previous: conversation.summary,
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
  });

  await prisma.assistantConversation.updateMany({
    where: { id: params.conversationId, userId: params.userId },
    data: {
      summary,
      title: conversation.title === "New conversation" ? deriveConversationTitle(params.userMessage, "general") : conversation.title,
      lastMessageAt: new Date(),
    },
  });
}

export async function updateAssistantAutoMemory(params: {
  userId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
}) {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: params.conversationId, userId: params.userId },
    select: { id: true, title: true, domain: true, summary: true },
  });
  if (!conversation) return;

  const projectDomain = getAssistantProjectMemoryDomainForTopic(conversation.domain);
  const topicValue = buildAutoMemoryValue({
    title: conversation.title,
    domain: conversation.domain,
    summary: conversation.summary,
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
  });
  const projectValue = `Latest ${conversation.domain} signal: ${compactLine(params.userMessage, 260)}. Thread: ${conversation.title}.`;

  await prisma.$transaction([
    prisma.assistantMemory.upsert({
      where: {
        userId_domain_key: {
          userId: params.userId,
          domain: conversation.domain,
          key: `thread:${conversation.id}`,
        },
      },
      create: {
        userId: params.userId,
        domain: conversation.domain,
        key: `thread:${conversation.id}`,
        value: topicValue,
        source: "system",
        confidence: 0.72,
      },
      update: {
        value: topicValue,
        source: "system",
        confidence: 0.72,
      },
    }),
    prisma.assistantMemory.upsert({
      where: {
        userId_domain_key: {
          userId: params.userId,
          domain: projectDomain,
          key: `current:${conversation.domain}`,
        },
      },
      create: {
        userId: params.userId,
        domain: projectDomain,
        key: `current:${conversation.domain}`,
        value: projectValue,
        source: "system",
        confidence: 0.68,
      },
      update: {
        value: projectValue,
        source: "system",
        confidence: 0.68,
      },
    }),
  ]);
}

export async function listAssistantMemories(userId: string, domain?: string, projectDomain?: string): Promise<AssistantMemoryItem[]> {
  const domains = Array.from(
    new Set(
      [
        "general",
        domain ? normalizeAssistantDomain(domain) : undefined,
        projectDomain ? normalizeAssistantDomain(projectDomain) : undefined,
        domain ? getAssistantProjectMemoryDomainForTopic(normalizeAssistantDomain(domain)) : undefined,
      ].filter(Boolean) as string[],
    ),
  );
  const memories = await prisma.assistantMemory.findMany({
    where: { userId, ...(domains.length ? { domain: { in: domains } } : {}) },
    orderBy: [{ domain: "asc" }, { updatedAt: "desc" }],
    take: 120,
  });
  return memories.map(projectMemory);
}

export function projectAssistantConversation(conversation: {
  id: string;
  title: string;
  domain: string;
  summary: string | null;
  description: string | null;
  pinned: boolean;
  archivedAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { messages: number };
}): AssistantConversationListItem {
  return {
    id: conversation.id,
    title: conversation.title,
    domain: conversation.domain,
    summary: conversation.summary,
    description: conversation.description,
    pinned: conversation.pinned,
    archivedAt: conversation.archivedAt?.toISOString() ?? null,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation._count?.messages ?? 0,
  };
}

export async function upsertAssistantMemory(params: {
  userId: string;
  domain: string;
  key: string;
  value: string;
  source?: string;
}) {
  const domain = normalizeAssistantDomain(params.domain);
  const key = params.key.trim().slice(0, 80);
  const value = params.value.trim().slice(0, 2000);
  if (!key || !value) throw new Error("Memory key and value are required.");
  const memory = await prisma.assistantMemory.upsert({
    where: { userId_domain_key: { userId: params.userId, domain, key } },
    create: {
      userId: params.userId,
      domain,
      key,
      value,
      source: params.source ?? "manual",
      confidence: params.source === "system" ? 0.65 : 1,
    },
    update: {
      value,
      source: params.source ?? "manual",
      confidence: params.source === "system" ? 0.65 : 1,
    },
  });
  return projectMemory(memory);
}

export function normalizeAssistantDomain(value: unknown) {
  if (typeof value !== "string") return "general";
  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return normalized || "general";
}


function buildLifeContextBlock(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "No live Jarvis state was provided.";
  const context = value as Record<string, unknown>;
  const today = typeof context.today === "string" ? context.today : "unknown";
  const timezone = typeof context.timezone === "string" ? context.timezone : "local";
  const todos = Array.isArray(context.todos) ? context.todos.slice(0, 14).map(formatTodoContext).filter(Boolean) : [];
  const mood = Array.isArray(context.mood) ? context.mood.slice(-8).map(formatMoodContext).filter(Boolean) : [];
  const sleep = Array.isArray(context.sleep) ? context.sleep.slice(-8).map(formatSleepContext).filter(Boolean) : [];
  return [
    `Today: ${today} (${timezone})`,
    `Open/upcoming tasks: ${todos.length ? todos.join("; ") : "none provided"}`,
    `Recent mood: ${mood.length ? mood.join("; ") : "none provided"}`,
    `Recent sleep: ${sleep.length ? sleep.join("; ") : "none provided"}`,
  ].join("\n");
}

function formatTodoContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const todo = value as Record<string, unknown>;
  const text = typeof todo.text === "string" ? compactLine(todo.text, 80) : "task";
  const day = typeof todo.day === "string" ? todo.day : "unscheduled";
  const done = todo.done === true ? "done" : "open";
  const start = typeof todo.startTime === "string" ? ` ${todo.startTime}` : "";
  return `${day}${start} ${done}: ${text}`;
}

function formatMoodContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const mood = value as Record<string, unknown>;
  const day = typeof mood.day === "string" ? mood.day : "unknown day";
  const score = typeof mood.mood === "number" ? mood.mood : "?";
  const note = typeof mood.note === "string" && mood.note.trim() ? ` ${compactLine(mood.note, 80)}` : "";
  return `${day}: ${score}/10${note}`;
}

function formatSleepContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const sleep = value as Record<string, unknown>;
  const day = typeof sleep.day === "string" ? sleep.day : "unknown day";
  const duration = typeof sleep.durationMins === "number" ? `${Math.round(sleep.durationMins / 60)}h` : "?";
  const quality = typeof sleep.quality === "number" ? `${sleep.quality}/5` : "?";
  return `${day}: ${duration}, quality ${quality}`;
}

function buildAutoMemoryValue(params: {
  title: string;
  domain: string;
  summary: string | null;
  userMessage: string;
  assistantMessage: string;
}) {
  return compactLine(
    `Thread "${params.title}" (${params.domain}). ${params.summary ? `Running summary: ${params.summary}. ` : ""}Latest user signal: ${params.userMessage}. Latest assistant response: ${params.assistantMessage}`,
    1800,
  );
}

function compactLine(value: string, maxLength: number) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 3).trim()}...` : compacted;
}

const assistantProjectTopicMap: Record<string, string> = {
  general: "general",
  daily: "general",
  finance: "career-finances",
  career: "career-finances",
  work: "career-finances",
  car: "career-finances",
  "real-estate": "career-finances",
  crypto: "career-finances",
  "stock-strategy": "career-finances",
  coding: "robotics-machining",
  laptop: "robotics-machining",
  server: "robotics-machining",
  "enterprise-engineering": "robotics-machining",
  "robot-arm": "robotics-machining",
  "raspberry-pi": "robotics-machining",
  cnc: "robotics-machining",
  health: "health",
  sleep: "health",
  fitness: "health",
};

function getAssistantProjectMemoryDomainForTopic(domain: string) {
  return `project-${assistantProjectTopicMap[domain] ?? "general"}`;
}

function buildOpenClawConversationSessionKey(params: { userId: string; domain: string; title: string }) {
  const configuredPrefix = process.env.OPENCLAW_SESSION_PREFIX?.trim() || "agent:main:jarvis";
  const userHash = createHash("sha256").update(params.userId).digest("hex").slice(0, 16);
  const titleSlug = slugify(params.title).slice(0, 48) || "chat";
  return `${configuredPrefix}:${userHash}:${params.domain}:${titleSlug}:${Date.now().toString(36)}`;
}

function deriveConversationTitle(seedText: string | undefined, domain: string) {
  const normalized = normalizeTitle(seedText ?? "");
  if (!normalized) return domain === "general" ? "New conversation" : `${titleCase(domain)} chat`;
  return normalized.length > 58 ? `${normalized.slice(0, 55).trim()}...` : normalized;
}

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "").trim();
}

function normalizeDescription(value: string | null) {
  if (value === null) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 600) : null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function titleCase(value: string) {
  return value.replace(/(^|[-_\s])([a-z])/g, (_match, prefix: string, char: string) => `${prefix ? " " : ""}${char.toUpperCase()}`).trim();
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4));
}

function buildRollingSummary(params: { previous: string | null; userMessage: string; assistantMessage: string }) {
  const addition = `User: ${params.userMessage}\nAssistant: ${params.assistantMessage}`;
  const combined = [params.previous, addition].filter(Boolean).join("\n\n");
  return combined.length > 1600 ? combined.slice(combined.length - 1600).trim() : combined;
}

function projectMessage(message: { id: string; role: string; content: string; source: string; createdAt: Date }): AssistantStoredMessage {
  return {
    id: message.id,
    role: message.role === "user" || message.role === "assistant" || message.role === "system" ? message.role : "assistant",
    content: message.content,
    source: message.source,
    createdAt: message.createdAt.toISOString(),
  };
}

function projectMemory(memory: {
  id: string;
  domain: string;
  key: string;
  value: string;
  source: string;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}): AssistantMemoryItem {
  return {
    id: memory.id,
    domain: memory.domain,
    key: memory.key,
    value: memory.value,
    source: memory.source,
    confidence: memory.confidence,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  };
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
