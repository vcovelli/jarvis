// Offline demonstration only. No dotenv, database, credentials or live transports.
import assert from "node:assert/strict";
import { routeRequest } from "../src/lib/intelligence/router.ts";
import { ollamaProvider, openAIProvider } from "../src/lib/intelligence/providers.ts";
import { providerBudgetAllows } from "../src/lib/intelligence/budget.ts";
import { memoryAbstention } from "../src/lib/memory/evidence.ts";

if (process.argv.length !== 2) {
  throw new Error("This proof accepts no arguments and has no live execution mode.");
}
globalThis.fetch = async () => {
  throw new Error("Live transport is forbidden in the offline intelligence proof.");
};

const json = (value) => new Response(JSON.stringify(value));
const cases = [
  { name: "deterministic", input: "calculate 12 * 8", preference: "auto", route: "deterministic", status: "completed" },
  { name: "local", input: "Summarize my preference.", preference: "local", route: "local", status: "completed" },
  { name: "authorized-cloud", input: "Explain this preference.", preference: "cloud", consent: ["private"], route: "openai", status: "completed" },
  { name: "private-cloud-denied", input: "Explain this preference.", preference: "cloud", route: null, status: "denied", reason: "privacy_denied" },
  { name: "budget-exhausted", input: "Explain this preference.", preference: "cloud", consent: ["private"], budgetExhausted: true, route: null, status: "denied", reason: "budget_exhausted" },
  { name: "missing-evidence", input: "What is my router's serial number?", preference: "auto", abstain: true, route: "deterministic", status: "completed", reason: "insufficient_evidence" },
  { name: "local-model-missing", input: "Summarize my preference.", preference: "local", missingModel: true, route: null, status: "unavailable", reason: "model_unavailable" },
];

const results = [];
for (const scenario of cases) {
  const audit = [];
  const requests = { local: 0, openai: 0, localHealth: 0 };
  const reservations = [];
  const local = ollamaProvider({
    INTELLIGENCE_LOCAL_URL: "http://127.0.0.1:11434",
    INTELLIGENCE_LOCAL_MODEL: "synthetic-fixture:small",
  }, async (url, init) => {
    if (url === "http://127.0.0.1:11434/api/tags") {
      requests.localHealth++;
      return json({ models: scenario.missingModel ? [] : [{ name: "synthetic-fixture:small" }] });
    }
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(init.body));
    assert.equal(body.stream, false);
    assert.equal(body.tools, undefined);
    assert.equal(String(init.body).includes("synthetic-owner"), false);
    requests.local++;
    return json({ done: true, done_reason: "stop", message: { role: "assistant", content: "You prefer concise answers. [Synthetic local response]" }, prompt_eval_count: 120, eval_count: 14 });
  });
  const cloud = openAIProvider({
    INTELLIGENCE_OPENAI_MODEL: "synthetic-cloud-fixture",
    OPENAI_API_KEY: "synthetic-key-never-transmitted",
  }, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.ok(reservations.length > 0, "Reserve before cloud dispatch");
    assert.ok(audit.some((event) => event.phase === "dispatch" && event.route === "openai"));
    const body = JSON.parse(String(init.body));
    assert.equal(body.store, false);
    assert.deepEqual(body.tools, []);
    assert.equal(body.tool_choice, "none");
    assert.equal(String(init.body).includes("synthetic-owner"), false);
    requests.openai++;
    return json({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Concise answers match your stated preference. [Synthetic cloud response]" }] }], usage: { input_tokens: 120, output_tokens: 16 } });
  });
  const request = {
    userId: "synthetic-owner",
    requestId: `proof-${scenario.name}`,
    input: scenario.input,
    preference: scenario.preference,
    complexity: "routine",
    latencyBudgetMs: 1000,
    maxCostUsd: 0.02,
    ...(scenario.consent ? { cloudAuthorization: { categories: scenario.consent } } : {}),
  };
  const result = await routeRequest(request, {
    providers: { local, openai: cloud },
    cloud: { enabled: true, inputUsdPerMillion: 1, outputUsdPerMillion: 2 },
    retrieve: async () => ({
      items: [{ id: "synthetic-memory", userId: request.userId, excerpt: "I prefer concise answers.", labels: ["private"] }],
      abstention: scenario.abstain ? memoryAbstention(request.input, "insufficient", false) : null,
    }),
    reserve: async (provider, upperBoundUsd, input) => {
      // Synthetic single-request fixture; NOT a persistent or concurrent ledger.
      const allowed = providerBudgetAllows(
        upperBoundUsd,
        { perRequestUsd: 0.02, dailyUsd: 0.05, monthlyUsd: 1 },
        { dayUsedUsd: 0, monthUsedUsd: 0 },
        { perRequestUsd: 0.02, dailyUsd: 0.05, monthlyUsd: 0.5 },
        { dayUsedUsd: scenario.budgetExhausted ? 0.05 : 0, monthUsedUsd: 0.05 },
        input.maxCostUsd,
      );
      if (allowed) reservations.push({ provider, upperBoundUsd });
      return allowed;
    },
    audit: async (event) => { audit.push(structuredClone(event)); },
  });
  assert.equal(result.status, scenario.status, scenario.name);
  assert.equal(result.route, scenario.route, scenario.name);
  if (scenario.reason) assert.equal(result.reason, scenario.reason, scenario.name);
  assert.equal(requests.openai, scenario.name === "authorized-cloud" ? 1 : 0);
  assert.equal(requests.local, scenario.name === "local" ? 1 : 0);
  if (scenario.name === "deterministic") assert.equal(result.text, "96");
  if (scenario.abstain) assert.match(result.text, /^I don't know from the available memory evidence\./);
  for (const forbidden of [request.input, "I prefer concise answers.", "synthetic-key-never-transmitted", "synthetic-memory"])
    assert.equal(JSON.stringify(audit).includes(forbidden), false, "Audit must omit content and credentials");
  results.push({ name: scenario.name, result, simulatedRequests: requests, syntheticReservations: reservations, audit });
}
console.log(JSON.stringify({ mode: "offline-synthetic", liveProviderCalls: 0, databaseConnections: 0, scenariosPassed: results.length, results }, null, 2));
