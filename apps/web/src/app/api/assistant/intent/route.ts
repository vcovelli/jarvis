import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  buildDeterministicInsight,
  coerceAssistantIntentResult,
  parseAssistantIntentFallback,
  type AssistantContextPayload,
  type AssistantFinanceContext,
  type AssistantIntentResult,
  type AssistantPriority,
} from "@/lib/assistantIntent";
import { prisma } from "@/lib/prisma";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_INTENT_MODEL = "gpt-5";

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

  const clientContext = sanitizeContext(body?.context);
  const finance = await buildFinanceContext(userId);
  const context: AssistantContextPayload = {
    ...clientContext,
    finance,
  };

  const fallback = parseAssistantIntentFallback(input, context);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ result: fallback, used: "fallback" });
  }

  try {
    const result = await parseWithOpenAI(apiKey, input, context, fallback);
    return NextResponse.json({ result, used: result.source ?? "openai" });
  } catch (error) {
    console.warn("OpenAI assistant intent parsing failed", error);
    return NextResponse.json({ result: fallback, used: "fallback" });
  }
}

async function parseWithOpenAI(
  apiKey: string,
  input: string,
  context: AssistantContextPayload,
  fallback: AssistantIntentResult,
): Promise<AssistantIntentResult> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_INTENT_MODEL ?? DEFAULT_INTENT_MODEL,
      input: [
        {
          role: "system",
          content: buildIntentSystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify({
            input,
            context,
            fallback,
          }),
        },
      ],
      text: {
        format: { type: "json_object" },
        verbosity: "low",
      },
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `OpenAI intent parsing failed with ${response.status}`);
  }

  const text = extractResponseText(data);
  const parsed = text ? JSON.parse(text) : null;
  const coerced = coerceAssistantIntentResult(parsed);
  if (!coerced) throw new Error("OpenAI returned an invalid intent payload.");

  const result: AssistantIntentResult = {
    ...fallback,
    ...coerced,
    source: "openai",
  };

  if (result.kind === "insight" && !result.assistantMessage) {
    result.assistantMessage = buildDeterministicInsight(context);
  }

  return result;
}

function buildIntentSystemPrompt() {
  return [
    "You are Jarvis' life command interpreter.",
    "Return only valid JSON. Do not include markdown.",
    "Map natural language, speech transcripts, and fuzzy wording into one Jarvis intent.",
    "Supported kind values: log_mood, add_journal, add_todo, log_sleep, update_todo, complete_todo, insight, clarify, unsupported.",
    "Use YYYY-MM-DD dates relative to context.today. Use HH:MM 24-hour times.",
    "Do not include date, time, duration, or priority words in todo.text.",
    "For phrases like add dinner 5:30pm, add a dinner 5 30 p m, or add a task for 5:30pm today for dinner, todo.text is Dinner and startTime is 17:30.",
    "For ambiguous spoken times, use daypart context: dinner/evening/tonight/night means PM, breakfast/morning means AM; otherwise prefer PM for 1-6 and AM for 7-11.",
    "For existing task changes, choose a todo.target.id from context.todos only when the match is clear. If ambiguous, use kind clarify and ask which task.",
    "For destructive or uncertain changes, ask a clarification. The client will require confirmation before saving.",
    "For insight requests, summarize useful patterns from todos, mood, sleep, and finance without financial advice.",
    "JSON shape: {kind, confidence, summary, clarification?, assistantMessage?, mood?, journal?, todo?, sleep?}.",
    "todo can include text, day, startTime, endTime, timeblockMins, priority, done, and target {id, day, text}.",
    "mood can include mood 1-10, note, tags, day. Prefer tags from context.moodTags when they match the user wording. sleep can include durationMins, quality 1-5, recoveryScore 1-5, day, startMinutes, endMinutes, notes.",
  ].join("\n");
}

function sanitizeContext(value: unknown): AssistantContextPayload {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const today = typeof record.today === "string" ? record.today : formatDayKey(new Date());
  return {
    nowIso: typeof record.nowIso === "string" ? record.nowIso : new Date().toISOString(),
    today,
    timezone: typeof record.timezone === "string" ? record.timezone : "UTC",
    todos: Array.isArray(record.todos)
      ? record.todos.slice(0, 80).map((todo) => {
          const item = todo && typeof todo === "object" ? (todo as Record<string, unknown>) : {};
          return {
            id: String(item.id ?? ""),
            day: typeof item.day === "string" ? item.day : today,
            text: typeof item.text === "string" ? item.text : "Untitled task",
            done: Boolean(item.done),
            priority: toAssistantPriority(item.priority),
            startTime: typeof item.startTime === "string" ? item.startTime : undefined,
            timeblockMins: typeof item.timeblockMins === "number" ? item.timeblockMins : undefined,
          };
        }).filter((todo) => todo.id && todo.text)
      : [],
    mood: Array.isArray(record.mood)
      ? record.mood.slice(0, 30).map((entry) => {
          const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          return {
            day: typeof item.day === "string" ? item.day : today,
            mood: typeof item.mood === "number" ? item.mood : Number(item.mood ?? 0),
            note: typeof item.note === "string" ? item.note : undefined,
            tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : undefined,
          };
        }).filter((entry) => entry.mood > 0)
      : [],
    moodTags: Array.isArray(record.moodTags)
      ? record.moodTags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).slice(0, 24)
      : [],
    sleep: Array.isArray(record.sleep)
      ? record.sleep.slice(0, 30).map((entry) => {
          const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          return {
            day: typeof item.day === "string" ? item.day : today,
            durationMins: typeof item.durationMins === "number" ? item.durationMins : Number(item.durationMins ?? 0),
            quality: typeof item.quality === "number" ? item.quality : Number(item.quality ?? 0),
            recoveryScore: typeof item.recoveryScore === "number" ? item.recoveryScore : undefined,
          };
        }).filter((entry) => entry.durationMins > 0)
      : [],
  };
}

async function buildFinanceContext(userId: string): Promise<AssistantFinanceContext | undefined> {
  const [accounts, transactions, holdings] = await Promise.all([
    prisma.financialAccount.findMany({ where: { userId } }),
    prisma.financialTransaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 50,
      select: { date: true, name: true, merchantName: true, amount: true, category: true },
    }),
    prisma.investmentHolding.findMany({ where: { userId }, select: { institutionValue: true } }),
  ]);

  if (!accounts.length && !transactions.length && !holdings.length) return undefined;

  const netWorth = accounts.reduce((total, account) => {
    const balance = account.currentBalance ?? account.availableBalance ?? 0;
    if (account.type === "credit" || account.type === "loan") return total - Math.abs(balance);
    return total + balance;
  }, 0);
  const cash = accounts
    .filter((account) => account.type === "depository")
    .reduce((total, account) => total + (account.currentBalance ?? account.availableBalance ?? 0), 0);
  const accountInvestments = accounts
    .filter((account) => account.type === "investment")
    .reduce((total, account) => total + (account.currentBalance ?? 0), 0);
  const holdingInvestments = holdings.reduce((total, holding) => total + (holding.institutionValue ?? 0), 0);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const spend30 = transactions
    .filter((transaction) => transaction.amount > 0 && transaction.date.getTime() >= cutoff)
    .reduce((total, transaction) => total + transaction.amount, 0);

  return {
    accounts: accounts.length,
    netWorth,
    cash,
    investments: holdingInvestments || accountInvestments,
    spend30,
    recentTransactions: transactions.slice(0, 12).map((transaction) => ({
      date: formatDayKey(transaction.date),
      name: transaction.merchantName ?? transaction.name,
      amount: transaction.amount,
      category: transaction.category,
    })),
  };
}

function toAssistantPriority(value: unknown): AssistantPriority | undefined {
  return value === 1 || value === 2 || value === 3 ? value : undefined;
}

function extractResponseText(data: unknown) {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (typeof record.output_text === "string") return record.output_text;
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    const outputItem = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const content = Array.isArray(outputItem.content) ? outputItem.content : [];
    for (const contentItem of content) {
      const contentRecord = contentItem && typeof contentItem === "object" ? (contentItem as Record<string, unknown>) : {};
      if (typeof contentRecord.text === "string") return contentRecord.text;
    }
  }
  return undefined;
}

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
