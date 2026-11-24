import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoute, priceFor, costOf, createSpendTracker, TASKS } from "./modelRouter.js";

test("resolveRoute reads a provider and model per task from the environment", () => {
  const env = { LLM_WRITE_PROVIDER: "Anthropic", LLM_WRITE_MODEL: " claude-haiku-5-5 ", LLM_EXTRACT_PROVIDER: "groq" };
  assert.deepEqual(resolveRoute("write", env), { provider: "anthropic", model: "claude-haiku-5-5" });
  assert.deepEqual(resolveRoute("extract", env), { provider: "groq", model: null });
  assert.deepEqual(resolveRoute("command", env), { provider: null, model: null });
  assert.deepEqual(resolveRoute("nonsense", { LLM_GENERAL_MODEL: "x" }), { provider: null, model: "x" });
  assert.deepEqual(resolveRoute("write", { LLM_WRITE_PROVIDER: "openai" }), { provider: null, model: null }); // unknown provider ignored
  assert.deepEqual(TASKS, ["extract", "command", "write", "general"]);
});

test("prices: known models, unknown model fallback, and an override", () => {
  assert.deepEqual(priceFor("openai/gpt-oss-120b", {}), [0.15, 0.6]);
  assert.deepEqual(priceFor("claude-haiku-5-5", {}), [1, 5]);
  assert.deepEqual(priceFor("something-new", {}), [1, 5]);
  assert.deepEqual(priceFor("openai/gpt-oss-120b", { LLM_PRICES: JSON.stringify({ "openai/gpt-oss-120b": [0.2, 0.7] }) }), [0.2, 0.7]);
  assert.deepEqual(priceFor("claude-haiku-5-5", { LLM_PRICES: "{not json" }), [1, 5]);
});

test("costOf: a typical Tailor session on gpt-oss-120b is about two cents", () => {
  const cost = costOf("openai/gpt-oss-120b", 50_000, 15_000, {});
  assert.ok(Math.abs(cost - 0.0165) < 1e-9);
});

test("spend tracker totals per day, task and model, and alerts once", () => {
  let t = new Date("2026-12-01T10:00:00Z");
  const alerts = [];
  const tracker = createSpendTracker({ alertUsd: 0.01, now: () => t, onAlert: (a) => alerts.push(a), env: {} });
  tracker.record({ task: "write", model: "claude-haiku-5-5", tokensIn: 10_000, tokensOut: 1_000 }); // 0.015
  tracker.record({ task: "extract", model: "openai/gpt-oss-120b", tokensIn: 3_000, tokensOut: 1_500 });
  const s = tracker.summary();
  assert.equal(s.calls, 2);
  assert.ok(s.costUsd > 0.015 && s.costUsd < 0.02);
  assert.equal(s.byTask.write.calls, 1);
  assert.equal(alerts.length, 1); // crossed 0.01 on the first call, not again on the second
  t = new Date("2026-12-02T00:30:00Z"); // a new day starts from zero and can alert again
  tracker.record({ task: "write", model: "claude-haiku-5-5", tokensIn: 10_000, tokensOut: 1_000 });
  assert.equal(tracker.summary().calls, 1);
  assert.equal(alerts.length, 2);
});

test("a call with no usage data counts as a call and costs nothing", () => {
  const tracker = createSpendTracker({ alertUsd: 1, env: {} });
  assert.equal(tracker.record({ task: "write", model: "x" }), 0);
  assert.equal(tracker.summary().calls, 1);
});
