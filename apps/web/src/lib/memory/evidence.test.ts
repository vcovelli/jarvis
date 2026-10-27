import assert from "node:assert/strict";
import test from "node:test";
import {
  selectEvidence,
  requestedFacet,
  memoryAbstention,
  UNKNOWN_MEMORY_ANSWER,
  hasStructuredEvidence,
} from "./evidence.ts";
import { answerabilityCases } from "./evaluation/answerability.ts";
import { clip } from "./policy.ts";
const record = (excerpt: string, id = "source-a") => ({
  id,
  title: "Saved fact",
  excerpt,
  sources: [{ sourceId: id }],
});
test("typed supported facts remain available while matched-topic absent facts are withheld", () => {
  for (const c of answerabilityCases) {
    assert.ok(requestedFacet(c.query), c.id);
    assert.equal(
      selectEvidence(c.query, [record(c.content)]).items.length,
      1,
      `supported:${c.id}`,
    );
    assert.equal(
      selectEvidence(c.query, [record(c.negative)]).items.length,
      0,
      `absent:${c.id}`,
    );
  }
});
test("a negated value, wrong entity, or missing source cannot support a typed answer", () => {
  const q = "What is my Cedar router's serial number?";
  for (const content of [
    "The Cedar router serial number is not CD-987Q.",
    "The Pine router serial number is PN-987Q.",
    "The Cedar router is working; the model number is CD-987Q.",
  ])
    assert.equal(selectEvidence(q, [record(content)]).items.length, 0, content);
  assert.equal(
    selectEvidence(q, [
      { ...record("The Cedar router serial number is CD-987Q."), sources: [] },
    ]).items.length,
    0,
  );
});
test("an unresolved exact date cannot be supplied by an undated related value", () => {
  assert.equal(
    selectEvidence("How much did I spend at the dentist last Tuesday?", [
      record("I spent 85 dollars at the dentist."),
    ]).status,
    "insufficient",
  );
});
test("abstention is explicit and does not fabricate source attribution or block ordinary chat", () => {
  assert.equal(
    memoryAbstention("What is my saved serial number?", "insufficient"),
    UNKNOWN_MEMORY_ANSWER,
  );
  assert.equal(
    memoryAbstention("What did we decide about backups?", "insufficient"),
    UNKNOWN_MEMORY_ANSWER,
  );
  assert.equal(
    memoryAbstention("Hello, help me brainstorm.", "insufficient"),
    null,
  );
  assert.equal(
    memoryAbstention("What is my average sleep?", "insufficient", true),
    null,
  );
  assert.equal(
    memoryAbstention("What did we decide?", "unverified_support"),
    null,
  );
});
test("unavailable structured placeholders do not suppress abstention", () => {
  assert.equal(
    hasStructuredEvidence([
      {
        kind: "operational_observation",
        data: { limitation: "No observation" },
      },
    ]),
    false,
  );
  assert.equal(
    hasStructuredEvidence([
      { kind: "sleep_aggregation", data: { entries: 0, meanMinutes: null } },
    ]),
    false,
  );
  assert.equal(
    hasStructuredEvidence([
      { kind: "sleep_aggregation", data: { entries: 3, meanMinutes: 420 } },
    ]),
    true,
  );
  assert.equal(
    hasStructuredEvidence([{ kind: "saved_tasks", data: { tasks: [] } }]),
    false,
  );
});
test("a budget ceiling is neither a sale price nor a loan interest rate", () => {
  const source = record(
    "I set an offer ceiling of three hundred thousand dollars for Elm Road.",
  );
  assert.equal(
    selectEvidence("What was the final sale price of Elm Road?", [source])
      .status,
    "insufficient",
  );
  assert.equal(
    selectEvidence("What interest rate did my bank offer for the car loan?", [
      source,
    ]).status,
    "insufficient",
  );
  assert.equal(
    selectEvidence("What is the name of my sleep specialist?", [
      record("My sleep specialist is Dr. Ada Winters."),
    ]).items.length,
    1,
  );
});

test("general instructions and definitions do not become memory abstentions", () => {
  for (const query of [
    "How do I restart my router?",
    "What should I plant in my garden?",
    "What is a serial number?",
    "Help me write an example serial number.",
  ]) {
    assert.equal(memoryAbstention(query, "insufficient"), null, query);
  }
});

test("support removed by excerpt clipping cannot suppress abstention", () => {
  const query = "What is my Cedar router's serial number?";
  const full = record(
    "A maintenance observation. ".repeat(80) +
      "The Cedar router serial number is CD-987Q.",
  );
  assert.equal(selectEvidence(query, [full]).status, "unverified_support");
  assert.equal(
    selectEvidence(query, [{ ...full, excerpt: clip(full.excerpt, 1100) }])
      .status,
    "insufficient",
  );
});
