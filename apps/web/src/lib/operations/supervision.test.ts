import assert from "node:assert/strict";
import test from "node:test";
import { agentChatDomain, agentFromChat, supervisionStatus } from "./supervision.ts";

const now = Date.parse("2026-10-26T00:00:00Z");
const base = () => ({
  stale: false, now,
  profile: { enabled: true, paused: false, workerSeenAt: new Date(now - 1000).toISOString(), dailyUsd: 1, monthlyUsd: 10 },
  costs: { day: { reservedUsd: 0.1 }, month: { reservedUsd: 0.5 } },
  activeRuns: [] as { domain: string; status: string }[],
});
test("readiness requires fresh data, an enabled profile, and a recent heartbeat", () => {
  assert.equal(supervisionStatus(base()), "Standing by");
  assert.equal(supervisionStatus({ ...base(), stale: true }), "Status unavailable");
  assert.equal(supervisionStatus({ ...base(), profile: null }), "Not configured");
  for (const workerSeenAt of [null, "invalid", new Date(now - 300_000).toISOString(), new Date(now + 120_000).toISOString()]) {
    assert.equal(supervisionStatus({ ...base(), profile: { ...base().profile, workerSeenAt } }), "Worker offline");
  }
  assert.equal(supervisionStatus({ ...base(), profile: { ...base().profile, paused: true } }), "Paused");
});
test("agent state separates active work, retries, queued work, and exhausted budget", () => {
  const data = base();
  data.activeRuns = [{ domain: "finance", status: "running" }, { domain: "business", status: "retry" }];
  assert.equal(supervisionStatus(data, "finance"), "Running");
  assert.equal(supervisionStatus(data, "business"), "Retry scheduled");
  assert.equal(supervisionStatus(data, "security"), "Standing by");
  data.activeRuns.push({ domain: "security", status: "queued" });
  assert.equal(supervisionStatus(data, "security"), "Queued");
  data.costs.day.reservedUsd = 1;
  assert.equal(supervisionStatus(data, "security"), "Budget reached");
  assert.equal(supervisionStatus(data, "finance"), "Running", "already reserved work is still running at the cap");
  data.costs.day.reservedUsd = 0;
  data.costs.month.reservedUsd = 10;
  assert.equal(supervisionStatus(data, "security"), "Budget reached");
});
test("only dedicated discussion domains identify an agent", () => {
  assert.equal(agentFromChat(agentChatDomain("finance")), "finance");
  assert.equal(agentFromChat("finance"), undefined);
  assert.equal(agentFromChat("agent-unknown"), undefined);
});
