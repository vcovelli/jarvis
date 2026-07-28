export type AssistantPriority = 1 | 2 | 3;

export type AssistantTodoCandidate = {
  id: string;
  day: string;
  text: string;
  done: boolean;
  priority?: AssistantPriority;
  startTime?: string;
  timeblockMins?: number;
};

export type AssistantMoodContext = {
  day: string;
  mood: number;
  note?: string;
  tags?: string[];
};

export type AssistantSleepContext = {
  day: string;
  durationMins: number;
  quality: number;
  recoveryScore?: number;
};

export type AssistantFinanceContext = {
  accounts: number;
  netWorth?: number;
  cash?: number;
  investments?: number;
  spend30?: number;
  recentTransactions?: Array<{
    date: string;
    name: string;
    amount: number;
    category?: string[];
  }>;
};

export type AssistantContextPayload = {
  nowIso: string;
  today: string;
  timezone: string;
  todos: AssistantTodoCandidate[];
  mood: AssistantMoodContext[];
  sleep: AssistantSleepContext[];
  moodTags?: string[];
  finance?: AssistantFinanceContext;
};

export type AssistantIntentKind =
  | "log_mood"
  | "add_journal"
  | "add_todo"
  | "log_sleep"
  | "update_todo"
  | "complete_todo"
  | "insight"
  | "clarify"
  | "unsupported";

export type AssistantIntentTodoTarget = {
  id?: string;
  day?: string;
  text?: string;
};

export type AssistantIntentResult = {
  kind: AssistantIntentKind;
  confidence: number;
  summary: string;
  source?: "local" | "openai";
  clarification?: string;
  assistantMessage?: string;
  mood?: {
    mood?: number;
    note?: string;
    tags?: string[];
    day?: string;
  };
  journal?: {
    text?: string;
    prompt?: "morning" | "priority" | "free";
    day?: string;
  };
  todo?: {
    text?: string;
    day?: string;
    startTime?: string;
    endTime?: string;
    timeblockMins?: number;
    priority?: AssistantPriority;
    target?: AssistantIntentTodoTarget;
    done?: boolean;
  };
  sleep?: {
    durationMins?: number;
    quality?: number;
    recoveryScore?: number;
    day?: string;
    startMinutes?: number;
    endMinutes?: number;
    notes?: string;
  };
};

const weekdayLabels = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const stopWords = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "i",
  "it",
  "me",
  "my",
  "of",
  "on",
  "please",
  "task",
  "the",
  "this",
  "to",
]);

export function parseAssistantIntentFallback(
  input: string,
  context: AssistantContextPayload,
): AssistantIntentResult {
  const normalized = input.trim();
  const lower = normalized.toLowerCase();
  const day = extractDayKey(normalized, context.today);
  const range = extractTimeRange(normalized);
  const startTime = range?.startTime ?? extractTime(normalized);
  const timeblockMins = range?.durationMins ?? extractDurationMinutes(normalized);
  const priority = extractPriority(normalized);

  if (isInsightRequest(lower)) {
    return {
      kind: "insight",
      confidence: 0.78,
      summary: "Show life insights",
      assistantMessage: buildDeterministicInsight(context),
      source: "local",
    };
  }

  if (isCompleteTodoRequest(lower)) {
    const targetText = extractTargetText(normalized, "complete");
    const target = findTodoTarget(targetText, context.todos);
    return {
      kind: target ? "complete_todo" : "clarify",
      confidence: target ? 0.8 : 0.45,
      summary: target ? `Complete ${target.text}` : "Choose a task to complete",
      clarification: target ? undefined : "Which task should I complete?",
      todo: { target: target ?? { text: targetText }, done: true },
      source: "local",
    };
  }

  if (isTodoUpdateRequest(lower)) {
    const targetText = extractTargetText(normalized, "update");
    const target = findTodoTarget(targetText, context.todos);
    const hasUpdate = Boolean(day || startTime || timeblockMins || priority);
    if (!target) {
      return {
        kind: "clarify",
        confidence: 0.45,
        summary: "Choose a task to update",
        clarification: "Which task should I update?",
        todo: {
          target: { text: targetText },
          day,
          startTime,
          endTime: range?.endTime,
          timeblockMins,
          priority,
        },
        source: "local",
      };
    }
    if (!hasUpdate) {
      return {
        kind: "clarify",
        confidence: 0.5,
        summary: `Update ${target.text}`,
        clarification: "What should I change about that task?",
        todo: { target },
        source: "local",
      };
    }
    return {
      kind: "update_todo",
      confidence: 0.78,
      summary: buildTodoUpdateSummary((target.text ?? targetText) || "task", { day, startTime, timeblockMins, priority }),
      todo: {
        target,
        day,
        startTime,
        endTime: range?.endTime,
        timeblockMins,
        priority,
      },
      source: "local",
    };
  }

  if (isSleepRequest(lower)) {
    const sleepRange = range ?? extractSleepRange(normalized);
    const durationFromRange = sleepRange?.startMinutes !== undefined && sleepRange.endMinutes !== undefined
      ? calculateDuration(sleepRange.startMinutes, sleepRange.endMinutes)
      : undefined;
    const durationMins = durationFromRange ?? extractDurationMinutes(normalized);
    const quality = extractQuality(normalized) ?? inferSleepQuality(lower);
    return {
      kind: durationMins ? "log_sleep" : "clarify",
      confidence: durationMins ? 0.74 : 0.45,
      summary: durationMins ? `Log ${formatDuration(durationMins)} of sleep` : "Log sleep",
      clarification: durationMins ? undefined : "How long did you sleep?",
      sleep: {
        durationMins,
        quality,
        recoveryScore: extractRecovery(normalized),
        day: day ?? context.today,
        startMinutes: sleepRange?.startMinutes,
        endMinutes: sleepRange?.endMinutes,
        notes: extractNote(normalized),
      },
      source: "local",
    };
  }

  if (isMoodRequest(lower) && !isCreateTodoRequest(lower) && !isTodoUpdateRequest(lower) && !isCompleteTodoRequest(lower)) {
    const mood = extractMoodScore(normalized) ?? inferMoodScore(lower);
    return {
      kind: mood ? "log_mood" : "clarify",
      confidence: mood ? 0.76 : 0.45,
      summary: mood ? `Log mood ${mood}/10` : "Log mood",
      clarification: mood ? undefined : "What mood score from 1 to 10 should I log?",
      mood: {
        mood,
        note: cleanMoodNote(normalized),
        tags: inferMoodTags(lower, context.moodTags),
        day: day ?? context.today,
      },
      source: "local",
    };
  }

  if (isJournalRequest(lower)) {
    const text = cleanJournalText(normalized);
    return {
      kind: text ? "add_journal" : "clarify",
      confidence: text ? 0.7 : 0.4,
      summary: "Add journal entry",
      clarification: text ? undefined : "What should I capture?",
      journal: {
        text,
        prompt: extractJournalPrompt(lower),
        day: day ?? context.today,
      },
      source: "local",
    };
  }

  if (isCreateTodoRequest(lower)) {
    const text = cleanTodoText(normalized);
    return {
      kind: text ? "add_todo" : "clarify",
      confidence: text ? 0.7 : 0.4,
      summary: text ? `Add ${smartTitleCase(text)}` : "Add task",
      clarification: text ? undefined : "What task should I add?",
      todo: {
        text: text ? smartTitleCase(text) : undefined,
        day: day ?? context.today,
        startTime,
        endTime: range?.endTime,
        timeblockMins,
        priority: priority ?? 2,
      },
      source: "local",
    };
  }

  return {
    kind: "unsupported",
    confidence: 0.2,
    summary: "I could not map that to an action yet.",
    clarification: "Try saying add a task, log sleep, log mood, move a task, complete a task, or ask for insights.",
    source: "local",
  };
}

export function coerceAssistantIntentResult(value: unknown): AssistantIntentResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : undefined;
  if (!kind || !isAssistantIntentKind(kind)) return null;
  return {
    kind,
    confidence: clampNumber(record.confidence, 0, 1, 0.5),
    summary: typeof record.summary === "string" ? record.summary : "Assistant action",
    clarification: optionalString(record.clarification),
    assistantMessage: optionalString(record.assistantMessage),
    mood: coerceRecord(record.mood),
    journal: coerceRecord(record.journal),
    todo: coerceRecord(record.todo),
    sleep: coerceRecord(record.sleep),
    source: record.source === "openai" ? "openai" : record.source === "local" ? "local" : undefined,
  };
}

export function buildDeterministicInsight(context: AssistantContextPayload) {
  const openTodos = context.todos.filter((todo) => !todo.done);
  const todayTodos = openTodos.filter((todo) => todo.day === context.today);
  const scheduledToday = todayTodos.filter((todo) => todo.startTime);
  const avgMood = average(context.mood.slice(0, 14).map((entry) => entry.mood));
  const avgSleep = average(context.sleep.slice(0, 14).map((entry) => entry.durationMins / 60));
  const finance = context.finance;
  const lines = [
    `You have ${todayTodos.length} open task${todayTodos.length === 1 ? "" : "s"} today, ${scheduledToday.length} scheduled.`,
  ];
  if (avgMood !== undefined) {
    lines.push(`Recent mood average is ${avgMood.toFixed(1)}/10.`);
  }
  if (avgSleep !== undefined) {
    lines.push(`Recent sleep average is ${avgSleep.toFixed(1)} hours.`);
  }
  if (finance?.accounts) {
    const spend = finance.spend30 !== undefined ? `, with about ${formatMoney(finance.spend30)} outflow in the last 30 days` : "";
    lines.push(`Finance has ${finance.accounts} connected account${finance.accounts === 1 ? "" : "s"}${spend}.`);
  }
  const highestPriority = openTodos.find((todo) => todo.priority === 1) ?? openTodos[0];
  if (highestPriority) {
    lines.push(`The next concrete move I would protect is: ${highestPriority.text}.`);
  }
  return lines.join(" ");
}

export function findTodoTarget(
  text: string | undefined,
  todos: AssistantTodoCandidate[],
): AssistantIntentTodoTarget | undefined {
  const candidates = todos.filter((todo) => !todo.done);
  if (!candidates.length) return undefined;
  const query = normalizeSearchText(text ?? "");
  if (!query) {
    return candidates.length === 1 ? todoToTarget(candidates[0]) : undefined;
  }
  let best: { todo: AssistantTodoCandidate; score: number } | undefined;
  for (const todo of candidates) {
    const score = scoreTextMatch(query, normalizeSearchText(todo.text));
    if (!best || score > best.score) {
      best = { todo, score };
    }
  }
  if (!best || best.score < 0.34) return undefined;
  return todoToTarget(best.todo);
}

function todoToTarget(todo: AssistantTodoCandidate): AssistantIntentTodoTarget {
  return { id: todo.id, day: todo.day, text: todo.text };
}

function isAssistantIntentKind(value: string): value is AssistantIntentKind {
  return [
    "log_mood",
    "add_journal",
    "add_todo",
    "log_sleep",
    "update_todo",
    "complete_todo",
    "insight",
    "clarify",
    "unsupported",
  ].includes(value);
}

function isInsightRequest(lower: string) {
  return /\b(insight|insights|summary|summarize|trend|trends|how am i doing|what should i focus|what should i do|review my|status)\b/.test(lower);
}

function isCompleteTodoRequest(lower: string) {
  return /\b(done|complete|completed|finish|finished|check off|mark .* done|cross off)\b/.test(lower);
}

function isTodoUpdateRequest(lower: string) {
  return /\b(move|reschedule|schedule|shift|push|change|update|priority|make .* priority|set .* priority)\b/.test(lower) &&
    !isCreateTodoRequest(lower);
}

function isSleepRequest(lower: string) {
  return (
    /\b(log|record|track|add)\s+(my\s+)?sleep\b/.test(lower) ||
    /\bsleep\s+\d+(?:\.\d+)?\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/.test(lower) ||
    /\b(slept|bed|woke up|wakeup|nap)\b/.test(lower)
  );
}

function isMoodRequest(lower: string) {
  return /\b(mood|feeling|feel|felt|stress|stressed|anxious|calm|happy|sad|angry|dialed|focused|foggy|tired|overwhelmed|frustrated|irritated|depressed|meh|neutral|great|good|bad|awful|excellent|low energy|burned out|burnt out)\b/.test(lower);
}

function isJournalRequest(lower: string) {
  return /\b(journal|note|capture|remember this|log this|reflection)\b/.test(lower) && !isCreateTodoRequest(lower);
}

function isCreateTodoRequest(lower: string) {
  return /\b(add|create|new task|todo|to-do|remind me to|remember to|need to|have to|gotta|make sure i|set up|schedule)\b/.test(lower);
}

function extractTargetText(input: string, mode: "complete" | "update") {
  let text = input.trim();
  if (mode === "complete") {
    text = text
      .replace(/\b(mark|make|set)\b/gi, " ")
      .replace(/\b(done|complete|completed|finish|finished|check off|cross off)\b/gi, " ");
  } else {
    text = text
      .replace(/\b(move|reschedule|shift|push|change|update|set|make)\b/gi, " ")
      .replace(/\b(priority|schedule|time|task|todo)\b/gi, " ");
  }
  return stripActionMetadata(text).trim();
}

function cleanTodoText(input: string) {
  const cleaned = normalizeTodoTitle(stripActionMetadata(stripTodoLeadIn(input)));
  return isPlaceholderTodoTitle(cleaned) ? "" : cleaned;
}

function stripTodoLeadIn(input: string) {
  return input
    .replace(/^hey jarvis[,\s]*/i, "")
    .replace(/^(please\s+)?(add|create|schedule|set up)\s+/i, "")
    .replace(/\b(add|create)\s+(a\s+)?(new\s+)?(task|todo)\s*(to)?\b/i, "")
    .replace(/\b(new task|todo|to-do)\b/i, "")
    .replace(/\b(remind me to|remember to|i need to|need to|i have to|have to|gotta|make sure i|set up|schedule)\b/i, "")
    .trim();
}

function normalizeTodoTitle(text: string) {
  return text
    .replace(/^hey jarvis[,\s]*/i, "")
    .replace(/^(please\s+)?(add|create|schedule|set up)\s+/i, "")
    .replace(/^(a|an|the)\s+(new\s+)?(task|todo)\s*(for|to)?\s*/i, "")
    .replace(/^(new\s+)?(task|todo)\s*(for|to)?\s*/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/^(remind me to|remember to|i need to|need to|i have to|have to|gotta|make sure i)\s+/i, "")
    .replace(/^(for|to)\s+/i, "")
    .replace(/\b(a|an|the)\s+(task|todo)\s+(for|to)\s+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "")
    .replace(/^(for|to)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .trim();
}

function isPlaceholderTodoTitle(text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return !normalized || ["a task", "task", "todo", "new task", "new todo"].includes(normalized);
}


function cleanJournalText(input: string) {
  return input
    .replace(/^hey jarvis[,\s]*/i, "")
    .replace(/\b(journal|note|capture|remember this|log this|reflection)\b\s*[:\-]?/i, "")
    .trim();
}

function cleanMoodNote(input: string) {
  const explicit = extractNote(input);
  if (explicit) return explicit;
  const cleaned = input
    .replace(/^hey jarvis[,\s]*/i, "")
    .replace(/\b(log|record|set|capture|my|mood|feeling|feel|felt|i am|i'm|im|i was|today|right now|currently)\b/gi, "")
    .replace(/\b(?:is|at|as)?\s*(?:10|[1-9])\s*(?:\/|out of)?\s*10?\b/gi, "")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:out of)?\s*ten\b/gi, "")
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "")
    .trim();
  return cleaned || undefined;
}

function stripActionMetadata(text: string) {
  return text
    .replace(/\b(today|tonight|tomorrow|tmrw|yesterday|next week|this weekend|next weekend)\b/gi, "")
    .replace(/\b(last|this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
    .replace(/\bin\s+\d+\s+(day|days|week|weeks)\b/gi, "")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "")
    .replace(/\bfrom\s+[0-9:.,\samp]+\s+to\s+[0-9:.,\samp]+\b/gi, "")
    .replace(/\bat\s+[0-9:.,\samp]+\s+to\s+[0-9:.,\samp]+\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+(1[0-2]|0?[1-9])(?:\s*[:.]\s*|\s+)?([0-5]\d)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+([01]?\d|2[0-3])[:.]([0-5]\d)\b/gi, "")
    .replace(/\b(1[0-2]|0?[1-9])(?:\s*[:.]\s*|\s+)?([0-5]\d)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/gi, "")
    .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+(1[0-2]|0?[1-9])\s*(morning|afternoon|evening|night)\b/gi, "")
    .replace(/\b(?:at|around|about|by|for)\s+(noon|midnight)\b/gi, "")
    .replace(/\b(for)\s+\d+(\.\d+)?\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/gi, "")
    .replace(/\bpriority\s+(high|medium|low|\d)\b/gi, "")
    .replace(/\b(high|medium|low)\s+priority\b/gi, "")
    .replace(/\bp[1-3]\b/gi, "")
    .replace(/\bquality\s*[1-5]\b/gi, "")
    .replace(/\brecovery\s*[1-5]\b/gi, "")
    .replace(/\b(note|notes)[:\-].+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}


function extractDayKey(text: string, todayKey: string) {
  const lower = text.toLowerCase();
  const today = dateFromDayKey(todayKey);
  if (lower.includes("tomorrow") || lower.includes("tmrw")) return addDaysKey(today, 1);
  if (lower.includes("yesterday") || lower.includes("last night")) return addDaysKey(today, -1);
  if (lower.includes("today") || lower.includes("tonight")) return todayKey;
  const inDays = lower.match(/\bin\s+(\d+)\s+(day|days)\b/);
  if (inDays) return addDaysKey(today, Number(inDays[1]));
  const inWeeks = lower.match(/\bin\s+(\d+)\s+(week|weeks)\b/);
  if (inWeeks) return addDaysKey(today, Number(inWeeks[1]) * 7);
  const slashDate = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    const currentYear = today.getFullYear();
    const year = slashDate[3]
      ? normalizeYear(Number(slashDate[3]))
      : currentYear;
    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (!Number.isNaN(date.getTime())) {
      if (!slashDate[3] && date < today) date.setFullYear(currentYear + 1);
      return formatDayKey(date);
    }
  }
  for (let index = 0; index < weekdayLabels.length; index += 1) {
    const label = weekdayLabels[index];
    const match = lower.match(new RegExp(`\\b(last|this|next)?\\s*${label}\\b`));
    if (!match) continue;
    const prefix = match[1];
    const currentDay = today.getDay();
    let offset = (index - currentDay + 7) % 7;
    if (prefix === "last") offset = offset === 0 ? -7 : offset - 7;
    if (prefix === "next" && offset === 0) offset = 7;
    return addDaysKey(today, offset);
  }
  if (lower.includes("next week")) return addDaysKey(today, 7);
  if (lower.includes("this weekend") || lower.includes("next weekend")) {
    const saturday = 6;
    let offset = (saturday - today.getDay() + 7) % 7;
    if (lower.includes("next weekend") && offset < 3) offset += 7;
    return addDaysKey(today, offset);
  }
  return undefined;
}

function extractTimeRange(text: string) {
  const match =
    text.match(/\bfrom\s+([0-9:.,\samp]+?)\s+to\s+([0-9:.,\samp]+)\b/i) ??
    text.match(/\bat\s+([0-9:.,\samp]+?)\s+to\s+([0-9:.,\samp]+)\b/i) ??
    text.match(/\b([0-9:.,\samp]+?)\s+to\s+([0-9:.,\samp]+)\b/i);
  if (!match) return undefined;
  const endMeridiem = extractMeridiem(match[2]);
  const startSource = endMeridiem && !extractMeridiem(match[1]) ? `${match[1]} ${endMeridiem}` : match[1];
  const startTime = extractTime(startSource);
  const endTime = extractTime(match[2]);
  if (!startTime || !endTime) return undefined;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return undefined;
  const durationMins = endMinutes > startMinutes ? endMinutes - startMinutes : undefined;
  return { startTime, endTime, startMinutes, endMinutes, durationMins };
}

function extractSleepRange(text: string) {
  const match = text.match(/\b(?:sleep|slept|bed)\s+(?:from\s+)?([0-9:.,\samp]+?)\s+(?:to|until|through)\s+([0-9:.,\samp]+)\b/i);
  if (!match) return undefined;
  const endMeridiem = extractMeridiem(match[2]);
  const startSource = endMeridiem && !extractMeridiem(match[1]) ? `${match[1]} ${endMeridiem}` : match[1];
  const startTime = extractTime(startSource);
  const endTime = extractTime(match[2]);
  const startMinutes = startTime ? parseTimeToMinutes(startTime) : null;
  const endMinutes = endTime ? parseTimeToMinutes(endTime) : null;
  if (startMinutes === null || endMinutes === null) return undefined;
  return { startMinutes, endMinutes };
}

function extractTime(text: string) {
  const match12 = text.match(/\b(1[0-2]|0?[1-9])(?:\s*[:.]\s*|\s+)?([0-5]\d)?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/i);
  if (match12) {
    return formatClockTime(Number(match12[1]), match12[2] ?? "00", match12[3]);
  }
  if (/\bnoon\b/i.test(text)) return "12:00";
  if (/\bmidnight\b/i.test(text)) return "00:00";

  const match24 = text.match(/\b(2[0-3]|1[3-9]|0?0):([0-5]\d)\b/);
  if (match24) return `${match24[1].padStart(2, "0")}:${match24[2]}`;

  const ambiguousClock = text.match(/\b(?:at|around|about|by|for|from|to)?\s*(1[0-2]|0?[1-9])[:.]([0-5]\d)\b/i);
  if (ambiguousClock) {
    const meridiem = inferMeridiemForAmbiguousTime(text, Number(ambiguousClock[1]));
    return formatClockTime(Number(ambiguousClock[1]), ambiguousClock[2], meridiem);
  }

  const casual = text.match(/\b(1[0-2]|0?[1-9])\s*(morning|afternoon|evening|night)\b/i);
  if (casual) {
    const meridiem = casual[2].toLowerCase() === "morning" ? "am" : "pm";
    return formatClockTime(Number(casual[1]), "00", meridiem);
  }

  const bareTime = text.match(/\b(?:at|around|about|by|for|from|to)\s+(1[0-2]|0?[1-9])\b(?!\s*(?:h|hr|hrs|hour|hours|m|min|mins|minute|minutes|out\s+of))/i);
  if (bareTime) {
    const meridiem = inferMeridiemForAmbiguousTime(text, Number(bareTime[1]));
    return formatClockTime(Number(bareTime[1]), "00", meridiem);
  }

  return undefined;
}

function formatClockTime(hourValue: number, minuteValue: string, meridiemValue: string) {
  let hours = hourValue;
  const meridiem = meridiemValue.toLowerCase().replace(/[\s.]/g, "");
  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return `${hours.toString().padStart(2, "0")}:${minuteValue.padStart(2, "0")}`;
}

function inferMeridiemForAmbiguousTime(text: string, hour: number): "am" | "pm" {
  const lower = text.toLowerCase();
  if (/\b(morning|breakfast|before work|early)\b/.test(lower)) return "am";
  if (/\b(afternoon|evening|tonight|night|dinner|supper|after work|lunch|pm|p\.m\.)\b/.test(lower)) return "pm";
  if (hour === 12) return "pm";
  if (hour >= 1 && hour <= 6) return "pm";
  return "am";
}


function extractDurationMinutes(text: string) {
  const halfHourMatch = text.match(/(\d+)\s+(?:and\s+a\s+)?half\s*(h|hr|hrs|hour|hours)?/i);
  if (halfHourMatch) return Number(halfHourMatch[1]) * 60 + 30;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    return Number.isNaN(hours) ? undefined : Math.round(hours * 60);
  }
  const minuteMatch = text.match(/(\d+)\s*(m|min|mins|minute|minutes)\b/i);
  if (minuteMatch) {
    const mins = Number(minuteMatch[1]);
    return Number.isNaN(mins) ? undefined : mins;
  }
  return undefined;
}

function extractMoodScore(text: string) {
  const numeric =
    text.match(/\b(?:mood|feeling|feel)\s*(?:is|at|as)?\s*(10|[1-9])\b/i) ??
    text.match(/\b(10|[1-9])\s*(?:\/|out of\s*)10\b/i) ??
    text.match(/\b(?:score|rating)\s*(?:is|at)?\s*(10|[1-9])\b/i);
  if (numeric) {
    const value = Number(numeric[1]);
    return Number.isNaN(value) ? undefined : value;
  }
  const wordScore = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\/|out of)?\s*(?:10|ten)?\b/i);
  return wordScore ? moodWordToScore(wordScore[1]) : undefined;
}

function moodWordToScore(value: string) {
  const scores: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  return scores[value.toLowerCase()];
}

function extractPriority(text: string): AssistantPriority | undefined {
  const lower = text.toLowerCase();
  if (/\b(high priority|priority high|p1|priority 1|urgent|critical)\b/.test(lower)) return 1;
  if (/\b(low priority|priority low|p3|priority 3|whenever)\b/.test(lower)) return 3;
  if (/\b(medium priority|priority medium|p2|priority 2)\b/.test(lower)) return 2;
  return undefined;
}

function extractQuality(text: string) {
  const match = text.match(/\bquality\s*([1-5])\b/i) ?? text.match(/\bq([1-5])\b/i);
  return match ? Number(match[1]) : undefined;
}

function extractRecovery(text: string) {
  const match = text.match(/\brecovery\s*([1-5])\b/i);
  return match ? Number(match[1]) : undefined;
}

function extractNote(text: string) {
  const match = text.match(/notes?[:\-]\s*(.+)$/i);
  return match ? match[1].trim() : undefined;
}

function extractJournalPrompt(lower: string) {
  const match = lower.match(/\b(morning|priority|free)\b/);
  return match ? (match[1] as "morning" | "priority" | "free") : "free";
}

function extractMeridiem(text: string) {
  const match = text.match(/\b(a\.?\s*m\.?|p\.?\s*m\.?)\b/i);
  return match ? match[1].toLowerCase().replace(/[\s.]/g, "") : undefined;
}

function inferMoodScore(lower: string) {
  if (/\b(amazing|excellent|fantastic|ecstatic|best|locked in)\b/.test(lower)) return 9;
  if (/\b(great|dialed|energized|confident|proud)\b/.test(lower)) return 8;
  if (/\b(good|solid|focused|calm|happy|steady|content)\b/.test(lower)) return 7;
  if (/\b(okay|fine|neutral|average|meh|alright)\b/.test(lower)) return 5;
  if (/\b(stressed|anxious|overwhelmed|foggy|tired|low energy|drained|burned out|burnt out)\b/.test(lower)) return 4;
  if (/\b(bad|awful|sad|angry|rough|terrible|depressed|frustrated|irritated|miserable)\b/.test(lower)) return 3;
  return undefined;
}

function inferMoodTags(lower: string, contextTags?: string[]) {
  const tagSet = new Set(["energy", "stress", "sleep", "workout", "focused", "calm", "foggy", "anxious", ...(contextTags ?? [])]);
  const aliases: Record<string, string[]> = {
    energy: ["energy", "energized", "low energy", "drained", "tired"],
    stress: ["stress", "stressed", "overwhelmed", "pressure"],
    sleep: ["sleep", "slept", "tired", "rested", "restless"],
    workout: ["workout", "gym", "run", "training", "lift"],
    focused: ["focused", "focus", "dialed", "locked in"],
    calm: ["calm", "peaceful", "steady"],
    foggy: ["foggy", "cloudy", "scattered"],
    anxious: ["anxious", "anxiety", "nervous"],
  };
  return Array.from(tagSet).filter((tag) => {
    const normalized = tag.toLowerCase();
    const words = aliases[normalized] ?? [normalized];
    return words.some((word) => lower.includes(word));
  });
}

function inferSleepQuality(lower: string) {
  if (/\b(great|excellent|amazing|rested)\b/.test(lower)) return 4;
  if (/\b(rough|bad|awful|restless|tired)\b/.test(lower)) return 2;
  return 3;
}

function buildTodoUpdateSummary(
  text: string,
  update: { day?: string; startTime?: string; timeblockMins?: number; priority?: AssistantPriority },
) {
  const pieces = [`Update ${text}`];
  if (update.day) pieces.push(`to ${update.day}`);
  if (update.startTime) pieces.push(`at ${update.startTime}`);
  if (update.timeblockMins) pieces.push(`for ${formatDuration(update.timeblockMins)}`);
  if (update.priority) pieces.push(`priority ${update.priority}`);
  return pieces.join(" ");
}

function scoreTextMatch(query: string, target: string) {
  if (!query || !target) return 0;
  if (target.includes(query) || query.includes(target)) return 1;
  const queryTokens = query.split(" ").filter((token) => token && !stopWords.has(token));
  const targetTokens = new Set(target.split(" ").filter((token) => token && !stopWords.has(token)));
  if (!queryTokens.length || !targetTokens.size) return 0;
  const hits = queryTokens.filter((token) => targetTokens.has(token)).length;
  return hits / Math.max(queryTokens.length, targetTokens.size);
}

function normalizeSearchText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function coerceRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, never>) : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function average(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return undefined;
  return clean.reduce((total, value) => total + value, 0) / clean.length;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
  }).format(value);
}

function dateFromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function addDaysKey(date: Date, offset: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + offset);
  return formatDayKey(next);
}

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function parseTimeToMinutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function calculateDuration(start: number, end: number) {
  const total = 24 * 60;
  const diff = (end - start + total) % total;
  return diff === 0 ? 8 * 60 : diff;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function smartTitleCase(text: string) {
  const hasUppercase = /[A-Z]/.test(text);
  if (hasUppercase) return text;
  return text
    .split(" ")
    .map((word, index) => {
      const trimmed = word.trim();
      if (!trimmed) return trimmed;
      if (index !== 0 && ["and", "or", "the", "to", "of", "in", "for"].includes(trimmed)) return trimmed;
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    })
    .join(" ");
}
