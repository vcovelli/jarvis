import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { runMemoryJob } from "../src/lib/memory/jobs.ts";
const dbUrl = new URL(process.env.DATABASE_URL ?? "http://invalid"),
  base = "http://127.0.0.1:3329";
if (
  process.env.MEMORY_TEST_ISOLATED !== "1" ||
  dbUrl.pathname !== "/jarvis_memory_test" ||
  dbUrl.searchParams.get("host") !== "/tmp/jarvis-memory-v2-db/socket"
)
  throw new Error("Disposable memory database required.");
const db = new PrismaClient(),
  tokens = {},
  ids = [];
let assertions = 0;
const require = createRequire(import.meta.url);
const { WebSocketServer } = require("next/dist/compiled/ws");
const sent = [];
const gateway = createServer((request, response) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
});
const sockets = new WebSocketServer({ server: gateway });
sockets.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "event",
      event: "connect.challenge",
      payload: { nonce: "isolated-fixture" },
    }),
  );
  socket.on("message", (raw) => {
    const frame = JSON.parse(raw.toString());
    socket.send(
      JSON.stringify({ type: "res", id: frame.id, ok: true, payload: {} }),
    );
    if (frame.method === "chat.send") {
      sent.push(frame.params);
      const runId = frame.params.idempotencyKey;
      socket.send(
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            runId,
            state: "delta",
            deltaText: "Mocked evidence response.",
          },
        }),
      );
      socket.send(
        JSON.stringify({
          type: "event",
          event: "chat",
          payload: {
            runId,
            state: "final",
            message: {
              content: [{ type: "text", text: "Mocked evidence response." }],
            },
          },
        }),
      );
    }
  });
});
await new Promise((resolve, reject) => {
  gateway.once("error", reject);
  gateway.listen(3330, "127.0.0.1", resolve);
});
async function request(
  actor,
  path,
  body,
  method = body ? "POST" : "GET",
  origin = base,
) {
  return fetch(base + path, {
    method,
    headers: {
      ...(actor ? { cookie: `next-auth.session-token=${tokens[actor]}` } : {}),
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function check(actual, expected) {
  assert.equal(actual, expected);
  assertions++;
}
try {
  for (const [name, tier] of [
    ["owner", "OWNER"],
    ["other", "OWNER"],
    ["member", "INVITED"],
  ]) {
    const id = `memory-http-${name}`;
    ids.push(id);
    await db.user.upsert({
      where: { id },
      update: {},
      create: {
        id,
        email: `${id}@example.test`,
        entitlement: { create: { tier, status: "active" } },
      },
    });
    tokens[name] = await encode({
      token: { id, sub: id, sessionVersion: 0 },
      secret: process.env.NEXTAUTH_SECRET,
    });
  }
  check((await request(null, "/api/assistant/memory")).status, 401);
  check(
    (
      await request(
        "owner",
        "/api/assistant/memory",
        { key: "x", value: "test" },
        "POST",
        "https://evil.example",
      )
    ).status,
    403,
  );
  check(
    (await request("member", "/api/assistant/memory/diagnostics")).status,
    403,
  );
  check(
    (
      await request("owner", "/api/assistant/memory", {
        key: "secret",
        value: "api_key: secret-example",
      })
    ).status,
    400,
  );
  const response = await request("owner", "/api/assistant/memory", {
    domain: "server",
    key: "Retention plan",
    value: "Server backups stay for thirty days.",
  });
  check(response.status, 200);
  const memory = (await response.json()).memory;
  check(
    (
      await request(
        "other",
        "/api/assistant/memory",
        { id: memory.id, key: "tamper", value: "Cross owner write" },
        "PATCH",
      )
    ).status,
    404,
  );
  check(
    (
      await request(
        "other",
        "/api/assistant/memory",
        { id: memory.id },
        "DELETE",
      )
    ).status,
    404,
  );
  check(
    (
      await (
        await request(
          "other",
          "/api/assistant/memory?domain=server&userId=memory-http-owner",
        )
      ).json()
    ).memories.length,
    0,
  );
  const correction = await request(
    "owner",
    "/api/assistant/memory",
    {
      id: memory.id,
      key: "Retention plan",
      value: "Server backups stay for sixty days.",
    },
    "PATCH",
  );
  check(correction.status, 200);
  const updated = (await correction.json()).memory;
  const search = await request(
    "owner",
    "/api/assistant/memory?domain=server&q=sixty",
  );
  check(search.headers.get("cache-control"), "private, no-store");
  check((await search.json()).memories[0].id, updated.id);
  const conversation = await db.assistantConversation.create({
    data: {
      userId: ids[0],
      domain: "server",
      title: "Memory acceptance",
      openClawSessionKey: "legacy-http-session",
      summary: "Existing rolling summary",
    },
  });
  await db.assistantMessage.create({
    data: {
      userId: ids[0],
      conversationId: conversation.id,
      role: "user",
      content: "Existing conversation",
    },
  });
  check(
    (await request("other", `/api/assistant/conversations/${conversation.id}`))
      .status,
    404,
  );
  check(
    (
      await request("other", "/api/assistant/message", {
        conversationId: conversation.id,
        input: "Try another user",
      })
    ).status,
    404,
  );
  const chat = await request("owner", "/api/assistant/message", {
    conversationId: conversation.id,
    input: "Remember that my server uses ZFS backups.",
    context: {
      todos: [
        {
          id: "forged",
          text: "Client record pretending to be authoritative",
          day: "2026-10-26",
        },
      ],
    },
  });
  check(chat.status, 200);
  check(chat.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const streamed = await chat.text();
  check(streamed.includes("event: delta"), true);
  check(streamed.includes("event: final"), true);
  check(sent.length, 1);
  check(
    sent[0].message.includes("Client record pretending to be authoritative"),
    false,
  );
  check(sent[0].message.includes("sixty days"), true);
  const nextChat = await request("owner", "/api/assistant/message", {
    conversationId: conversation.id,
    input: "What did we decide about server backups?",
  });
  await nextChat.text();
  check(sent.length, 2);
  check(sent[0].sessionKey !== sent[1].sessionKey, true);
  check(
    sent.every((s) => s.sessionKey.includes("jarvis-memory-v2")),
    true,
  );
  // The application must abstain itself; the mock gateway would otherwise invent a reply.
  const beforeAbstention = sent.length;
  const unknown = await request("owner", "/api/assistant/message", {
    conversationId: conversation.id,
    input: "What is my Cedar server's serial number?",
  });
  const unknownBody = await unknown.json();
  check(unknown.status, 200);
  check(unknownBody.used, "memory-insufficient");
  check(
    unknownBody.message.startsWith(
      "I don't know from the available memory evidence.",
    ),
    true,
  );
  check(sent.length, beforeAbstention);
  check(
    await db.assistantMessage.count({
      where: {
        conversationId: conversation.id,
        role: "assistant",
        source: "memory-insufficient",
      },
    }),
    1,
  );
  const identifier = await request("owner", "/api/assistant/memory", {
    domain: "server",
    key: "Device identifier",
    value: "My Cedar server serial number is CS-747Q.",
  });
  check(identifier.status, 200);
  const known = await request("owner", "/api/assistant/message", {
    conversationId: conversation.id,
    input: "What is my Cedar server's serial number?",
  });
  check(known.headers.get("content-type"), "text/event-stream; charset=utf-8");
  await known.text();
  check(sent.length, beforeAbstention + 1);
  check(sent.at(-1).message.includes("CS-747Q"), true);
  for (let i = 0; i < 40; i++) {
    if (!(await runMemoryJob(db, ids[0]))) break;
  }
  const extracted = await db.memoryRecord.findFirstOrThrow({
    where: { userId: ids[0], extractionMethod: "rules-v2" },
    include: { sources: true },
  });
  check(extracted.assertion, "user_stated");
  check(extracted.sources[0].sourceType, "user_message");
  const sourcePath = `/api/assistant/memory/source?type=user_message&id=${extracted.sources[0].sourceId}`;
  check((await request("other", sourcePath)).status, 404);
  check((await request("owner", sourcePath)).status, 200);
  check(
    (
      await db.assistantConversation.findUniqueOrThrow({
        where: { id: conversation.id },
      })
    ).openClawSessionKey,
    "legacy-http-session",
  );
  if (process.env.MEMORY_PLAYWRIGHT_PATH) {
    const { chromium } = await import(process.env.MEMORY_PLAYWRIGHT_PATH);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      await context.addCookies([
        { name: "next-auth.session-token", value: tokens.owner, url: base },
      ]);
      await context.addInitScript(() =>
        localStorage.setItem(
          "jarvis-walkthrough-v2:memory-http-owner:personal",
          JSON.stringify({ version: 2, welcomed: true, guides: {} }),
        ),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${base}/v2/assistant?conversation=${conversation.id}`);
      await page
        .getByRole("button", { name: "Chat settings", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Manage memory", exact: true })
        .click();
      const panel = page.getByRole("complementary", { name: "Saved memories" });
      await panel.waitFor();
      await panel.getByLabel("Title", { exact: true }).fill("UI server plan");
      await panel
        .getByLabel("What should Jarvis remember?")
        .fill("Server backups run every evening.");
      await panel
        .getByRole("button", { name: "Save memory", exact: true })
        .click();
      const card = panel.locator("article").filter({
        has: page.getByRole("heading", {
          name: "UI server plan",
          exact: true,
        }),
      });
      await card.waitFor();
      await card.getByRole("button", { name: "Correct", exact: true }).click();
      await panel
        .getByLabel("What should Jarvis remember?")
        .fill("Server backups run every morning.");
      await panel.getByRole("button", { name: "Save correction" }).click();
      await card
        .getByText("Server backups run every morning.", { exact: true })
        .waitFor();
      await panel.getByLabel("Search", { exact: true }).fill("every morning");
      await page.waitForFunction(
        () =>
          document.querySelectorAll(
            'aside[aria-label="Saved memories"] article',
          ).length === 1,
      );
      await page.screenshot({ path: "/tmp/jarvis-memory-v2-mobile.png" });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await card.getByRole("button", { name: "Delete saved memory" }).click();
      await card.getByRole("button", { name: "Confirm delete" }).click();
      await card.waitFor({ state: "detached" });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: "/tmp/jarvis-memory-v2-desktop.png" });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      check(errors.length, 0);
    } finally {
      await browser.close();
    }
  }
  check(
    (
      await request(
        "owner",
        "/api/assistant/memory",
        { id: updated.id },
        "DELETE",
      )
    ).status,
    200,
  );
  check(
    (await request("owner", "/api/assistant/memory/diagnostics")).status,
    200,
  );
  console.log(
    JSON.stringify({
      assertions,
      browser: Boolean(process.env.MEMORY_PLAYWRIGHT_PATH),
    }),
  );
} finally {
  for (const socket of sockets.clients) socket.terminate();
  await new Promise((resolve) => gateway.close(resolve));
  sockets.close();
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
