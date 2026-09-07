import assert from "node:assert/strict";
import test from "node:test";

import { MemoryRateLimitStore } from "./rateLimitStore.ts";

test("rate limiter blocks over-limit calls and returns retry timing", () => {
  const store = new MemoryRateLimitStore();
  const config = { limit: 2, windowMs: 1000 };
  assert.equal(store.consume("key", config, 100).allowed, true);
  assert.equal(store.consume("key", config, 100).allowed, true);
  const blocked = store.consume("key", config, 100);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 1);
  assert.equal(store.consume("key", config, 1100).allowed, true);
});
