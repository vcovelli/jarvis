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
import { enforceRateLimit } from "@/lib/rateLimit";
import { getFinanceAnalytics } from "@/lib/finance/analytics";
import { normalizeFinancialTransactions } from "@/lib/finance/normalization";
import { prisma } from "@/lib/prisma";
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
  const limited = enforceRateLimit(request, "assistant", userId);
  if (limited) return limited;

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

  if (isFinanceQuestion(input)) {
    const demoMode = resolved.context.demoMode === true;
    const message = demoMode ? buildDemoFinanceMessage(input) : await buildFinanceMessage(userId, input);
    await appendAssistantMessage({
      userId,
      conversationId: conversation.id,
      role: "assistant",
      content: message,
      source: demoMode ? "jarvis-finance-demo" : "jarvis-finance",
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
      used: "jarvis-finance",
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


function buildDemoFinanceMessage(input: string) {
  const lines = [
    "Demo finance mode is active. I am using generated showcase data, not live Plaid data.",
    "For the last 30 days: income is $8,500, spending is $3,642, and net cash flow is +$4,858.",
    "Demo net worth is $280,360, with $26,900 cash, $182,700 invested, and $1,240 in credit liabilities.",
    "Top demo spend categories are Housing $1,743, Groceries $396, and Food Dining $335.",
    "Two demo events need classification review: a payroll bonus and a brokerage transfer candidate.",
  ];
  if (/transfer|investment|brokerage|portfolio/i.test(input)) {
    lines.push("Demo transfers and investment contributions are excluded from everyday spend so the dashboard can show clean classification behavior.");
  }
  return lines.join(" ");
}

async function buildFinanceMessage(userId: string, input: string) {
  const rangeDays = inferFinanceRangeDays(input);
  const rangeCutoff = getFinanceRangeCutoff(rangeDays);
  const [accountCount, connectionCount, rawTransactionCount, existingCanonicalEventCount, missingCanonicalTransactions] = await Promise.all([
    prisma.financialAccount.count({ where: { userId } }),
    prisma.financialConnection.count({ where: { userId, status: "active" } }),
    prisma.financialTransaction.count({ where: { userId } }),
    prisma.financialEvent.count({ where: { userId } }),
    prisma.financialTransaction.findMany({
      where: { userId, financialEvent: null },
      orderBy: { date: "desc" },
      take: 5000,
      select: { id: true },
    }),
  ]);

  const backfill = missingCanonicalTransactions.length
    ? await normalizeFinancialTransactions(userId, {
        transactionIds: missingCanonicalTransactions.map((transaction) => transaction.id),
      })
    : { transactions: 0, events: 0, transferMatches: 0 };
  const canonicalEventCount = existingCanonicalEventCount + backfill.events;

  const [analytics, rawRangeTransactions] = await Promise.all([
    getFinanceAnalytics(userId, { rangeDays, includePending: false }),
    prisma.financialTransaction.findMany({
      where: { userId, pending: false, date: { gte: rangeCutoff } },
      orderBy: { date: "desc" },
      take: 1000,
      select: {
        name: true,
        merchantName: true,
        amount: true,
        category: true,
        isoCurrencyCode: true,
      },
    }),
  ]);

  if (!accountCount && !rawTransactionCount && !analytics.manualPositions.length) {
    return "I can reach the finance system, but I do not see connected accounts, transactions, or manual positions yet. Connect Plaid on the finance page, then run Sync.";
  }

  const rawFallback = canonicalEventCount === 0 ? buildRawFinanceFallback(rawRangeTransactions) : null;
  const periodIncome = rawFallback?.income ?? analytics.cashFlow.income;
  const periodSpend = rawFallback?.spending ?? analytics.cashFlow.spending;
  const periodNetFlow = rawFallback?.netCashFlow ?? analytics.cashFlow.netCashFlow;
  const periodSavingsRate = periodIncome > 0 ? (periodIncome - periodSpend) / periodIncome : analytics.savings.savingsRate;
  const currency = rawFallback?.currency ?? analytics.currency ?? "USD";
  const lines = [
    `I can see your finance data. For the last ${rangeDays} days:`,
    `Income is ${formatMoney(periodIncome, currency)}, spending is ${formatMoney(periodSpend, currency)}, and net cash flow is ${formatSignedMoney(periodNetFlow, currency)}.`,
    `Net worth is ${formatMoney(analytics.netWorth.totalNetWorth, currency)}; liquid net worth is ${formatMoney(analytics.netWorth.liquidNetWorth, currency)}. Cash is ${formatMoney(analytics.netWorth.cash, currency)}, investments are ${formatMoney(analytics.netWorth.investableAssets + analytics.netWorth.retirementAssets, currency)}, and liabilities are ${formatMoney(analytics.netWorth.totalLiabilities, currency)}.`,
  ];

  if (periodSavingsRate !== null) {
    lines.push(`Savings rate for the period is ${formatPercent(periodSavingsRate)}.`);
  }
  if (analytics.cashFlow.transfers > 0) {
    lines.push(`${formatMoney(analytics.cashFlow.transfers, currency)} of internal transfers were excluded from spend.`);
  }
  if (analytics.cashFlow.investmentContributions > 0) {
    lines.push(`Investment contributions total ${formatMoney(analytics.cashFlow.investmentContributions, currency)}.`);
  }

  const topCategories = rawFallback?.topCategories ?? analytics.spendingByCategory.slice(0, 3);
  if (topCategories.length) {
    lines.push(`Top spend categories: ${topCategories.map((item) => `${item.label} ${formatMoney(item.value, currency)}`).join(", ")}.`);
  }
  const topMerchants = rawFallback?.topMerchants ?? analytics.spendingByMerchant.slice(0, 3);
  if (topMerchants.length) {
    lines.push(`Top merchants: ${topMerchants.map((item) => `${item.label} ${formatMoney(item.value, currency)}`).join(", ")}.`);
  }

  if (rawFallback && rawTransactionCount > 0) {
    lines.push("This answer is using raw Plaid transactions because canonical finance events have not been created yet. Run Finance > Sync to activate transfer-aware classification for assistant answers.");
  }
  if (analytics.reviewQueue.length) {
    lines.push(`${analytics.reviewQueue.length} finance event${analytics.reviewQueue.length === 1 ? "" : "s"} need classification review.`);
  }
  if (connectionCount === 0) {
    lines.push("No active Plaid connections are currently linked.");
  }

  return lines.join(" ");
}

function buildRawFinanceFallback(
  transactions: Array<{
    name: string;
    merchantName: string | null;
    amount: number;
    category: string[];
    isoCurrencyCode: string | null;
  }>,
) {
  if (!transactions.length) return null;
  const outflows = transactions.filter((transaction) => transaction.amount > 0);
  const inflows = transactions.filter((transaction) => transaction.amount < 0);
  const spending = outflows.reduce((total, transaction) => total + transaction.amount, 0);
  const income = inflows.reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
  return {
    income,
    spending,
    netCashFlow: income - spending,
    currency: mostCommon(transactions.map((transaction) => transaction.isoCurrencyCode).filter((value): value is string => Boolean(value))),
    topCategories: summarizeRawBreakdown(outflows, (transaction) => transaction.category[0] ?? "Uncategorized"),
    topMerchants: summarizeRawBreakdown(outflows, (transaction) => transaction.merchantName ?? transaction.name),
  };
}

function summarizeRawBreakdown<T extends { amount: number }>(items: T[], getLabel: (item: T) => string) {
  const totals = new Map<string, number>();
  items.forEach((item) => {
    const label = titleCase(getLabel(item).trim() || "Uncategorized");
    totals.set(label, (totals.get(label) ?? 0) + item.amount);
  });
  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label, value]) => ({ label, value }));
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function getFinanceRangeCutoff(rangeDays: number) {
  const date = new Date();
  date.setDate(date.getDate() - rangeDays + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isFinanceQuestion(input: string) {
  const normalized = input.toLowerCase();
  return /\b(finance|finances|financial|money|spend|spending|spent|budget|cash\s*flow|cashflow|net worth|income|paycheck|salary|savings?|investments?|portfolio|holdings?|brokerage|retirement|debt|liabilit(?:y|ies)|credit card|transactions?|plaid)\b/.test(normalized);
}

function inferFinanceRangeDays(input: string) {
  const normalized = input.toLowerCase();
  if (/\b(year|annual|12 months|365)\b/.test(normalized)) return 365;
  if (/\b(6 months|six months|180)\b/.test(normalized)) return 180;
  if (/\b(quarter|3 months|three months|90)\b/.test(normalized)) return 90;
  if (/\b(2 months|two months|60)\b/.test(normalized)) return 60;
  return 30;
}

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

function formatSignedMoney(value: number, currency = "USD") {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}${formatMoney(Math.abs(value), currency)}`;
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: Math.abs(value) >= 1 ? 0 : 1,
  }).format(value);
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
