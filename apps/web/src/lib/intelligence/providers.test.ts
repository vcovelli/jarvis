import assert from "node:assert/strict";
import test from "node:test";
import { ollamaProvider, openAIProvider, type ProviderRequest } from "./providers.ts";

const local = { INTELLIGENCE_LOCAL_URL: "http://127.0.0.1:11434", INTELLIGENCE_LOCAL_MODEL: "fixture:small" };
const cloud = { INTELLIGENCE_OPENAI_MODEL: "configured-model", OPENAI_API_KEY: "fake-never-sent-secret" };
const request = (): ProviderRequest => ({ prompt: "Explain a synthetic fixture.", signal: new AbortController().signal, maxOutputTokens: 100 });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const localAnswer = () => ({ done: true, done_reason: "stop", message: { role: "assistant", content: "Synthetic answer." }, prompt_eval_count: 20, eval_count: 4 });
const cloudAnswer = () => ({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Synthetic answer." }] }], usage: { input_tokens: 20, output_tokens: 4 } });
const never: typeof fetch = async () => { assert.fail("Unexpected provider request"); };

test("providers require explicit configuration and transport", () => {
  assert.equal(ollamaProvider({}, never), null);
  assert.equal(openAIProvider({}, never), null);
  assert.equal(openAIProvider({ OPENAI_API_KEY: "existing-key-is-not-opt-in" }, never), null);
  assert.throws(() => ollamaProvider({ INTELLIGENCE_LOCAL_MODEL: "fixture" }, never), /invalid_configuration/);
  assert.throws(() => openAIProvider({ INTELLIGENCE_OPENAI_MODEL: "fixture" }, never), /invalid_configuration/);
  assert.throws(() => openAIProvider({ ...cloud, INTELLIGENCE_OPENAI_MODEL: "bad model" }, never), /invalid_model/);
  assert.throws(() => ollamaProvider(local, undefined as unknown as typeof fetch), /invalid_configuration/);
});

test("local endpoint permits only literal loopback origins and rejects cloud aliases", () => {
  for (const endpoint of [
    "http://localhost:11434", "http://example.com", "http://127.0.0.2:11434",
    "http://127.1:11434", "http://2130706433:11434", "http://127.0.0.1:11434/api/chat",
    "http://user:password@127.0.0.1:11434", "http://127.0.0.1:11434/?url=secret",
    "http://127.0.0.1:11434/#secret", "http://127.0.0.1:11434/foo/..", "file:///tmp/model",
  ]) assert.throws(() => ollamaProvider({ ...local, INTELLIGENCE_LOCAL_URL: endpoint }, never), /invalid_endpoint/);
  assert.ok(ollamaProvider({ ...local, INTELLIGENCE_LOCAL_URL: "http://[::1]:11434/" }, never));
  assert.throws(() => ollamaProvider({ ...local, INTELLIGENCE_LOCAL_MODEL: "fixture:cloud" }, never), /nonlocal_model/);
});

test("local health checks the exact configured model and does not load or pull models", async () => {
  let calls = 0;
  const provider = ollamaProvider(local, async (url, init) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:11434/api/tags");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.body, undefined);
    return json({ models: [{ name: calls === 1 ? "fixture:other" : "fixture:small" }] });
  })!;
  assert.deepEqual(await provider.health(request().signal), { available: true, modelAvailable: false });
  assert.deepEqual(await provider.health(request().signal), { available: true, modelAvailable: true });
  const down = ollamaProvider(local, async () => new Response("private provider diagnostic", { status: 503 }))!;
  assert.deepEqual(await down.health(request().signal), { available: false, modelAvailable: false });
});

test("local inference sends bounded text without tools or credentials", async () => {
  const req = request();
  const provider = ollamaProvider({ ...local, OPENAI_API_KEY: cloud.OPENAI_API_KEY }, async (url, init) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    assert.equal(init?.signal, req.signal);
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).has("Authorization"), false);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.stream, false);
    assert.equal(body.model, local.INTELLIGENCE_LOCAL_MODEL);
    assert.equal(body.options.num_predict, 100);
    assert.equal(body.messages[1].content, req.prompt);
    assert.equal("tools" in body, false);
    assert.equal(String(init?.body).includes(cloud.OPENAI_API_KEY), false);
    return json(localAnswer());
  })!;
  assert.deepEqual(await provider.infer(req), { text: "Synthetic answer.", inputTokens: 20, outputTokens: 4 });
  assert.equal(JSON.stringify(provider).includes(cloud.OPENAI_API_KEY), false);
});

test("cloud readiness is configuration-only and makes no request", async () => {
  const provider = openAIProvider(cloud, never)!;
  assert.deepEqual(await provider.health(request().signal), { available: true, modelAvailable: true });
  assert.equal(JSON.stringify(provider).includes(cloud.OPENAI_API_KEY), false);
});

test("cloud endpoint is pinned and sends no tools or persistent conversation state", async () => {
  const provider = openAIProvider({ ...cloud, OPENAI_BASE_URL: "http://attacker.invalid" }, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${cloud.OPENAI_API_KEY}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.equal(body.stream, false);
    assert.deepEqual(body.tools, []);
    assert.equal(body.tool_choice, "none");
    assert.equal(body.previous_response_id, undefined);
    assert.equal(body.conversation, undefined);
    assert.equal(body.input, request().prompt);
    assert.equal(body.max_output_tokens, 100);
    assert.equal(String(init?.body).includes(cloud.OPENAI_API_KEY), false);
    return json(cloudAnswer());
  })!;
  assert.deepEqual(await provider.infer(request()), { text: "Synthetic answer.", inputTokens: 20, outputTokens: 4 });
});

test("both adapters reject oversized UTF-8 prompts and invalid output bounds before transport", async () => {
  for (const provider of [ollamaProvider(local, never)!, openAIProvider(cloud, never)!]) {
    for (const prompt of ["", " ", "é".repeat(4001)])
      await assert.rejects(provider.infer({ ...request(), prompt }), /invalid_request/);
    for (const maxOutputTokens of [0, -1, 801, 1.5, NaN, Infinity])
      await assert.rejects(provider.infer({ ...request(), maxOutputTokens }), /invalid_request/);
  }
});

test("local rejects tool calls, incomplete generation and malformed usage", async () => {
  const invalid = [
    { ...localAnswer(), done: false },
    { ...localAnswer(), done_reason: "length" },
    { ...localAnswer(), message: { role: "assistant", content: "run this", tool_calls: [] } },
    { ...localAnswer(), message: { role: "tool", content: "run this" } },
    { ...localAnswer(), message: { role: "assistant", content: "" } },
    { ...localAnswer(), prompt_eval_count: -1 },
  ];
  for (const body of invalid)
    await assert.rejects(ollamaProvider(local, async () => json(body))!.infer(request()), /invalid_(output|usage)/);
});

test("cloud rejects tool outputs, refusal, incomplete or empty answers", async () => {
  const invalid = [
    { ...cloudAnswer(), status: "incomplete" },
    { ...cloudAnswer(), output: [{ type: "function_call", name: "shell", arguments: "sensitive command" }] },
    { ...cloudAnswer(), output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "No" }] }] },
    { ...cloudAnswer(), output: [] },
    { ...cloudAnswer(), usage: { input_tokens: "20", output_tokens: 1 } },
  ];
  for (const body of invalid)
    await assert.rejects(openAIProvider(cloud, async () => json(body))!.infer(request()), /invalid_(output|usage)/);
  const answer = { ...cloudAnswer(), usage: undefined };
  assert.deepEqual(await openAIProvider(cloud, async () => json(answer))!.infer(request()), {
    text: "Synthetic answer.", inputTokens: null, outputTokens: null,
  });
});

test("transport and provider diagnostics never appear in returned errors", async () => {
  for (const factory of [
    (transport: typeof fetch) => ollamaProvider(local, transport)!,
    (transport: typeof fetch) => openAIProvider(cloud, transport)!,
  ]) {
    await assert.rejects(factory(async () => { throw new Error(cloud.OPENAI_API_KEY); }).infer(request()), { message: "intelligence_provider_unavailable" });
    await assert.rejects(factory(async () => new Response(cloud.OPENAI_API_KEY, { status: 401 })).infer(request()), { message: "intelligence_provider_unavailable" });
    await assert.rejects(factory(async () => new Response(cloud.OPENAI_API_KEY)).infer(request()), { message: "intelligence_provider_invalid_response" });
    await assert.rejects(factory(async () => new Response("x".repeat(64 * 1024 + 1))).infer(request()), /response_too_large/);
  }
});

test("aborted requests never invoke transports and suppress caller abort details", async () => {
  const abort = new AbortController();
  abort.abort(cloud.OPENAI_API_KEY);
  for (const provider of [ollamaProvider(local, never)!, openAIProvider(cloud, never)!]) {
    await assert.rejects(provider.infer({ ...request(), signal: abort.signal }), { message: "intelligence_provider_aborted" });
    await assert.rejects(provider.health(abort.signal), { message: "intelligence_provider_aborted" });
  }
});

test("aborting during a streamed response cancels the reader", async () => {
  const abort = new AbortController();
  let cancelled = false;
  const provider = ollamaProvider(local, async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"done":'));
        setTimeout(() => abort.abort("private detail"), 5);
      },
      cancel() { cancelled = true; },
    });
    return new Response(body);
  })!;
  await assert.rejects(provider.infer({ ...request(), signal: abort.signal }), { message: "intelligence_provider_aborted" });
  assert.equal(cancelled, true);
});
