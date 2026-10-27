import { digest, classifyLabels, type Agent, type Label } from "../policy.ts";
import { scenarios } from "./scenarios.ts";

export const EVAL_NOW = new Date("2026-10-26T12:00:00.000Z");
export const OWNERS = [
  "memory-eval-alex",
  "memory-eval-blair",
  "memory-eval-casey",
] as const;
export type Document = {
  id: string;
  userId: string;
  domain: string;
  title: string;
  content: string;
  sourceId: string;
  sourceAt: Date;
  effectiveAt: Date;
  expiresAt: Date | null;
  status: "active" | "superseded" | "deleted";
  labels: Label[];
  importance: number;
  kind: "target" | "hard_negative" | "distractor" | "boundary";
};
export type Query = {
  id: string;
  text: string;
  userId: string;
  agent: Agent;
  domains: string[];
  expectedSourceIds: string[];
  cohort: string;
  scenario: string;
};
const lanes = [
  "server",
  "coding",
  "finance",
  "real-estate",
  "career",
  "sleep",
  "journal",
  "general",
];
const names = [
  "Cedar",
  "Juniper",
  "Atlas",
  "Harbor",
  "Beacon",
  "Gallery",
  "Workshop",
  "Maple",
  "Pocket",
  "Ledger",
  "Portal",
  "Trail",
  "Orchard",
  "Calendar",
  "Archive",
  "Balance",
  "Nimbus",
  "Brookfield",
  "Oak",
  "Elm",
  "River",
  "Pine",
  "Lake",
  "North",
  "Grove",
  "Willow",
  "Aspen",
  "Birch",
  "Meadow",
  "Stone",
  "Summit",
  "Valley",
];
// Background text has overlap with the real query subjects but never supplies the target answer.
const background: Record<string, string[]> = {
  server: [
    "The service health check passed after a routine restart. No configuration decision was made.",
    "The storage overview showed a small increase in free space after temporary files were removed.",
    "The monitoring panel recorded brief packet loss during an access point reboot; later probes were healthy.",
    "A backup job completed, but this observation did not test restoration or change retention settings.",
    "The rack inventory was updated after moving an unused cable. No replacement disk was installed.",
    "A maintenance note mentions checking the fan curve next visit. The proposed change is still unapproved.",
  ],
  coding: [
    "The issue tracker was updated with a reproduction and screenshot. The underlying bug is still under investigation.",
    "A code review requested clearer error text and a smaller helper function; no authentication change was merged.",
    "The local build passed after refreshing generated types. Production deployment remains a separate step.",
    "The prototype screen was reviewed on a phone. The team has not selected a new interaction policy.",
    "A data import fixture was expanded with empty rows to reproduce a parsing bug.",
    "The documentation example was corrected to match the current parameter names.",
  ],
  finance: [
    "The monthly review noted that grocery spending was higher than the prior month; no new savings target was set.",
    "An account balance was reconciled against the statement. The note contains no account identifier or credential.",
    "A merchant label was corrected during expense review. The classification still needs confirmation.",
    "A one-time reimbursement arrived and should be considered separately from recurring income.",
    "The budget worksheet was reopened to compare categories. No transfer or purchase was authorized.",
    "A small subscription renewal was noticed in the statement. The user requested information, not cancellation.",
  ],
  "real-estate": [
    "The viewing had good natural light and a small kitchen. No offer decision was recorded.",
    "The listing was saved for a future comparison, but its maintenance history has not been verified.",
    "A contractor visit was discussed and remains unscheduled. There is no final repair estimate yet.",
    "The property brochure was added to the folder. Asking rent is a seller claim, not measured income.",
    "The search map was reviewed after new listings appeared. Existing purchase criteria were not changed.",
    "A neighborhood visit revealed construction near the station. The effect on weekday travel is unknown.",
  ],
  career: [
    "The weekly project update listed completed reviews and an unresolved dependency. No promotion decision was announced.",
    "A colleague shared a learning resource after the meeting. It was bookmarked for later reading.",
    "The team retro included a request for clearer issue ownership and fewer duplicate status updates.",
    "A routine calendar invitation was moved to accommodate a visitor. Standing focus-time preferences were unchanged.",
    "A draft proposal was shortened before review. The manager has not approved the project scope.",
    "The handoff document received comments on terminology; operational acceptance is still pending.",
  ],
  sleep: [
    "The sleep log was recorded late in the morning. It is one observation, not evidence of a lasting trend.",
    "The evening was unusually busy because visitors stayed late. No bedtime routine was formally changed.",
    "The wearable needed charging before the next night. Its stage estimates were not reviewed.",
    "The room felt warm overnight, according to a personal note. There was no objective temperature measurement.",
    "A short daytime rest was mentioned without exact duration. The entry should not be treated as a completed experiment.",
    "The weekly chart has uneven coverage and should disclose missing observations.",
  ],
  journal: [
    "The writer felt pleased after finishing a small household task and wanted to remember that moment.",
    "A reflection described uncertainty before a conversation. It did not establish what the other person intended.",
    "The entry noted a busy commute and a quiet evening, without making a causal claim about mood.",
    "The writer considered a different weekend plan but made no commitment.",
    "A personal reflection mentioned money worries. It remains private even though the topic touches finance.",
    "The writer enjoyed time outdoors and wanted to make room for rest during a full week.",
  ],
  general: [
    "The household checklist was reviewed before guests arrived. No recurring preference was changed.",
    "A small repair was added to the weekend list. The cause of the problem has not been established.",
    "A meal idea was saved after a conversation, but there is no complete weekly menu yet.",
    "A travel option was bookmarked for comparison. Nothing was booked or purchased.",
    "The plant pots were moved temporarily while the balcony was cleaned.",
    "A reminder to return a borrowed item was added after a visit with a friend.",
  ],
};
function seeded(seed = 20261026) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function makeCorpus(distractors = 20000) {
  const random = seeded();
  const documents: Document[] = [],
    queries: Query[] = [];
  const add = (
    p: Partial<Document> &
      Pick<Document, "id" | "domain" | "title" | "content">,
  ) => {
    const sourceAt = p.sourceAt ?? new Date("2023-04-18T12:00:00Z");
    documents.push({
      userId: OWNERS[0],
      sourceId: `source:${p.id}`,
      sourceAt,
      effectiveAt: sourceAt,
      expiresAt: null,
      status: "active",
      labels: classifyLabels(p.domain, `${p.title} ${p.content}`),
      importance: 3,
      kind: "target",
      ...p,
    });
  };
  for (const [index, row] of scenarios.entries()) {
    const [key, lane, title, content, negative, ...questions] = row;
    add({
      id: `target:${key}`,
      domain: lane,
      title,
      content,
      sourceAt: new Date(Date.UTC(2022 + (index % 3), index % 12, 10)),
    });
    add({
      id: `negative:${key}`,
      domain: lane,
      title: `${title} discussion`,
      content: negative,
      sourceAt: new Date("2026-09-10T12:00:00Z"),
      kind: "hard_negative",
    });
    add({
      id: `project:${key}`,
      domain: "project-ember",
      title,
      content: `For project Ember only: ${negative}`,
      kind: "hard_negative",
    });
    for (const userId of OWNERS.slice(1))
      add({
        id: `${userId}:${key}`,
        userId,
        domain: lane,
        title,
        content,
        kind: "boundary",
      });
    for (const state of ["superseded", "deleted", "expired", "future"] as const)
      add({
        id: `${state}:${key}`,
        domain: lane,
        title,
        content: `Earlier or ineligible version: ${content}`,
        kind: "boundary",
        status:
          state === "superseded" || state === "deleted" ? state : "active",
        ...(state === "expired" ? { expiresAt: new Date("2025-01-01") } : {}),
        ...(state === "future" ? { effectiveAt: new Date("2027-01-01") } : {}),
      });
    for (const [q, text] of questions.entries())
      queries.push({
        id: `${key}:${q}`,
        text,
        userId: OWNERS[0],
        agent: "assistant",
        domains: [],
        expectedSourceIds: [`source:target:${key}`],
        cohort: ["literal", "paraphrase", "conversational"][q],
        scenario: key,
      });
    queries.push({
      id: `${key}:scoped`,
      text: questions[1],
      userId: OWNERS[0],
      agent: "assistant",
      domains: [lane],
      expectedSourceIds: [`source:target:${key}`],
      cohort: "scoped",
      scenario: key,
    });
  }
  for (let index = 0; index < distractors; index++) {
    const lane = lanes[Math.floor(random() * lanes.length)];
    const name = names[Math.floor(random() * names.length)];
    const note =
      background[lane][Math.floor(random() * background[lane].length)];
    const day = new Date(
      Date.UTC(
        2025 + (index % 3 === 0 ? 0 : 1),
        Math.floor(random() * 9),
        1 + Math.floor(random() * 28),
        index % 24,
        index % 60,
      ),
    );
    add({
      id: `background:${String(index).padStart(5, "0")}`,
      userId:
        index % 10 < 6 ? OWNERS[0] : index % 10 < 9 ? OWNERS[1] : OWNERS[2],
      domain: lane,
      title: `${name} ${["follow-up", "review", "observation", "planning note", "check-in"][index % 5]}`,
      content: `${day.toISOString().slice(0, 10)} — ${name} review. ${note} ${["Follow-up is optional.", "The previous decision remains unchanged.", "This entry contains no new instruction.", "The source is a user note from that day."][index % 4]}`,
      sourceAt: day,
      importance: 1 + (index % 4),
      kind: "distractor",
    });
  }
  const unanswerable = [
    "What is the exact serial number of my Cedar NAS?",
    "What is my mortgage lender's phone number?",
    "What is the name of my sleep specialist?",
    "How much did I spend at the dentist last Tuesday?",
    "Which hotel did I book for my next holiday?",
    "What was the measured blood pressure at my last appointment?",
    "What is the street address of Sam's new apartment?",
    "Which insurance company issued my flood quote?",
    "How much revenue did the Nimbus project earn last quarter?",
    "What was the exact final sale price of Oak Avenue?",
    "What is my dog's veterinarian's name?",
    "How many sick days do I have left?",
    "What interest rate did my bank offer for the car loan?",
    "What was the measured causal effect of coffee on my sleep?",
    "What is my dentist appointment date?",
    "Which airport is on my confirmed train ticket?",
    "What is the model number of my dishwasher pump?",
    "How many kilograms did I weigh this morning?",
    "What is the confirmed birth date of Lee?",
    "Which shares did I sell yesterday?",
    "Who is the author of the book my mentor recommended?",
    "What were the exact annual property taxes on Pine Street?",
    "What firmware version is installed on the Atlas UPS?",
    "Which company employs Morgan?",
  ];
  for (const [index, text] of unanswerable.entries())
    queries.push({
      id: `absent:${index}`,
      text,
      userId: OWNERS[0],
      agent: "assistant",
      domains: [],
      expectedSourceIds: [],
      cohort: "unanswerable",
      scenario: `absent:${index}`,
    });
  for (const row of scenarios.filter((r) =>
    ["server", "finance", "journal", "sleep"].includes(r[1]),
  )) {
    const [key, lane, , , , , text] = row;
    const agent: Agent = ["server", "sleep"].includes(lane)
      ? "infrastructure-monitor"
      : "financial-analyst";
    // Pre-scoring authorization review: Workshop and employer add the work label.
    // Their specialized agents may see other lane records, but not these sources.
    const mixedLabelDenied = ["vm-stutter", "retirement-match"].includes(key);
    const permitted =
      (lane === "server" || lane === "finance") && !mixedLabelDenied;
    queries.push({
      id: `agent:${key}`,
      text,
      userId: OWNERS[0],
      agent,
      domains: [lane],
      expectedSourceIds: permitted ? [`source:target:${key}`] : [],
      cohort: permitted
        ? "agent_allowed"
        : mixedLabelDenied
          ? "agent_mixed_denied"
          : "agent_denied",
      scenario: key,
    });
  }
  const fingerprint = digest(JSON.stringify({ documents, queries }));
  return { documents, queries, fingerprint };
}
