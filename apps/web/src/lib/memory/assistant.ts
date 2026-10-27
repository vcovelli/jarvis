import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getFinanceAnalytics } from "@/lib/finance/analytics";
import { composeContext } from "./context";
import {
  digest,
  disclosureAccess,
  hasSecrets,
  LABELS,
  serverAccess,
  clip,
} from "./policy";
import { retrieve } from "./retrieval";
import {
  memoryAbstention,
  hasStructuredEvidence,
  requestedFacet,
  selectEvidence,
} from "./evidence";
import { structuredContext } from "./structured";
import { audit } from "./store";

export async function buildMemoryContext(params: {
  userId: string;
  conversationId: string;
  userMessage: string;
  currentMessageId: string;
  projectDomain: string;
}) {
  const conversation = await prisma.assistantConversation.findFirst({
    where: { id: params.conversationId, userId: params.userId },
  });
  if (!conversation) throw new Error("Conversation not found.");
  const allowed = (process.env.MEMORY_CONTEXT_ALLOWED_LABELS ?? "")
    .split(",")
    .map((s) => s.trim());
  const access = disclosureAccess(
    serverAccess(params.userId, "assistant", [
      "general",
      conversation.domain,
      params.projectDomain,
    ]),
    allowed,
  );
  const historyAllowed = LABELS.every((l) => allowed.includes(l));
  const [memories, structured, messages] = await Promise.all([
    retrieve(prisma, access, params.userMessage),
    structuredContext(
      prisma,
      access,
      params.userMessage,
      async (userId, days) => {
        const a = await getFinanceAnalytics(userId, {
          rangeDays: days,
          includePending: false,
        });
        return {
          days: a.rangeDays,
          generatedAt: a.generatedAt,
          currency: a.currency,
          income: a.cashFlow.income,
          spending: a.cashFlow.spending,
          netCashFlow: a.cashFlow.netCashFlow,
          count: a.transactionCount,
          series: a.cashFlow.cashFlowSeries,
          limitation:
            "Classified authoritative records only; incomplete data is not a complete financial picture.",
        };
      },
    ),
    historyAllowed
      ? prisma.assistantMessage.findMany({
          where: {
            userId: params.userId,
            conversationId: conversation.id,
            id: { not: params.currentMessageId },
            role: { in: ["user", "assistant"] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 6,
          select: { id: true, role: true, content: true },
        })
      : [],
  ]);
  // Judge only excerpts that can actually be sent, then recheck after budget selection.
  const contextEvidence = selectEvidence(
    params.userMessage,
    memories.items.map((m) => ({ ...m, excerpt: clip(m.excerpt, 1100) })),
  );
  const configured = Number(process.env.MEMORY_CONTEXT_TOKEN_BUDGET ?? 12000);
  const result = composeContext({
    task: params.userMessage,
    identity: `Authenticated owner. Agent: personal assistant. Authorized scopes: ${access.domains.join(", ")}.`,
    structured,
    memories: contextEvidence.items.map((m) => ({
      id: m.id,
      kind: m.assertion,
      data: {
        excerpt: m.excerpt,
        sources: m.sources,
        scope: m.scope,
        at: m.freshness,
        conflict: m.conflict,
        confidence: m.confidence,
      },
    })),
    summary: historyAllowed ? conversation.summary : null,
    messages: messages
      .filter((m) => !hasSecrets(m.content))
      .map((m) => ({
        id: m.id,
        kind: `historical_${m.role}`,
        data: clip(m.content, 450),
      })),
    budget: Number.isFinite(configured) ? configured : 12000,
  });
  const suppliedEvidence = selectEvidence(
    params.userMessage,
    contextEvidence.items.filter((m) =>
      result.selectedMemoryIds.includes(m.id),
    ),
  );
  await audit(prisma, params.userId, "context", {
    conversationId: conversation.id,
    ids: result.selectedMemoryIds,
    tokenEstimate: result.tokenEstimate,
    sections: result.sections,
    taskTruncated: result.taskTruncated,
    evidenceStatus: suppliedEvidence.status,
    evidenceReason: suppliedEvidence.reason,
  });
  // Per-turn gateway sessions prevent stale transcripts/withdrawn memories being replayed.
  // The legacy session key remains persisted, intact, for explicit rollback.
  const agent =
    (process.env.OPENCLAW_AGENT_ID ?? "main").replace(/[^a-z0-9_-]/gi, "") ||
    "main";
  const sessionKey = `agent:${agent}:jarvis-memory-v2:${digest([params.userId, conversation.id, params.currentMessageId, process.env.MEMORY_SESSION_EPOCH ?? "1", randomUUID()].join(":")).slice(0, 40)}`;
  const abstention = memoryAbstention(
    params.userMessage,
    suppliedEvidence.status,
    !requestedFacet(params.userMessage) &&
      Boolean(result.sections.authoritative_records) &&
      hasStructuredEvidence(structured),
  );
  return { message: result.text, sessionKey, abstention };
}
