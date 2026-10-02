/**
 * LLM provider switch – the browser sends prompts to POST /api/llm and the
 * server picks the provider, so no model API key reaches the client.
 *
 * Provider: LLM_PROVIDER=groq|anthropic, else Groq when GROQ_API_KEY is set,
 * else Anthropic. Models: GROQ_MODEL / ANTHROPIC_MODEL override the defaults.
 *
 * When the primary provider is rate limited, the call falls back to the other one (if
 * configured); Groq's free tier caps tokens per model per day, so Groq also steps through
 * GROQ_FALLBACK_MODELS (comma-separated).
 */

import Anthropic from "@anthropic-ai/sdk";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
// Opus 5.5 always thinks; effort sets how much (its default is "medium" – kept explicit).
const DEFAULT_ANTHROPIC_EFFORT = "medium";
const DEFAULT_GROQ_FALLBACK_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

/** Errors whose message is safe and useful to show users (everything else is logged, not returned). */
export class LLMUserError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message, { cause });
    this.status = status;
  }
}

/** This model can't serve the request right now (rate limited, retired, or not enabled) – try the next one. */
class RateLimitedError extends Error {}

function groqModels() {
  const fallbacks = process.env.GROQ_FALLBACK_MODELS
    ? process.env.GROQ_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
    : DEFAULT_GROQ_FALLBACK_MODELS;
  return [...new Set([process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL, ...fallbacks])];
}

function anthropicKey() {
  // VITE_ANTHROPIC_API_KEY is the old browser-side name; still honoured so existing .env files work.
  return process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || "";
}

export function llmProvider() {
  const forced = (process.env.LLM_PROVIDER || "").toLowerCase();
  if (forced === "groq" || forced === "anthropic") return forced;
  if (process.env.GROQ_API_KEY) return "groq";
  if (anthropicKey()) return "anthropic";
  return null;
}

export function llmModel() {
  const provider = llmProvider();
  if (provider === "groq") return process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL;
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  return null;
}

const TRUNCATED_MESSAGE = "Response was cut off by the token limit before it finished. Try again, or shorten the input.";
const DECLINED_MESSAGE = "The AI couldn't help with that request. Try rephrasing it, or remove anything unusual from the input.";
const BUSY_MESSAGE = "ResumeIQ has reached its AI usage limit for the moment. Please try again in a few minutes.";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RATE_LIMIT_WAIT_MS = 20000;

async function callGroq({ system, user, maxTokens, json }, model, attempt = 0) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      // JSON answers (scores, extraction, assistant turns) should repeat for the same input.
      temperature: json ? 0 : 0.2,
      ...(json ? { seed: 7 } : {}),
      // gpt-oss reasons before answering and those tokens share this budget, so leave headroom.
      max_completion_tokens: maxTokens + 2048,
      ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}),
      // Qwen otherwise inlines <think>…</think> in the reply, which breaks JSON answers.
      ...(/qwen/.test(model) ? { reasoning_format: "hidden" } : {}),
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 429 && attempt === 0) {
    // Free tier is limited per minute; Groq says how long to wait ("try again in 5.01s"), so wait once and retry.
    const seconds = Number((data?.error?.message || "").match(/try again in ([\d.]+)s/)?.[1]) || Number(response.headers.get("retry-after")) || 5;
    const waitMs = Math.ceil(seconds * 1000) + 250;
    if (waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
      console.log(`[llm] Groq rate limit on ${model} – retrying in ${(waitMs / 1000).toFixed(1)}s`);
      await sleep(waitMs);
      return callGroq({ system, user, maxTokens, json }, model, attempt + 1);
    }
  }
  if (response.status === 429 || response.status === 404 || data?.error?.code === "model_not_found" || data?.error?.code === "model_decommissioned") {
    // Daily (or long) limit, or a model Groq has retired – the caller moves on to the next model.
    throw new RateLimitedError(data?.error?.message || `Groq model ${model} unavailable (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq API error ${response.status}`);
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new LLMUserError(TRUNCATED_MESSAGE);
  return choice?.message?.content || "";
}

let anthropicClient;

async function callAnthropic({ system, user, maxTokens }, model) {
  anthropicClient ??= new Anthropic({ apiKey: anthropicKey() });
  let response;
  try {
    response = await anthropicClient.beta.messages.create({
      model,
      // Thinking shares this budget with the answer, so leave plenty of headroom above the reply size.
      max_tokens: Math.max(16000, maxTokens + 8000),
      output_config: { effort: process.env.ANTHROPIC_EFFORT || DEFAULT_ANTHROPIC_EFFORT },
      // If a safety classifier declines, the API re-runs the request on a suitable fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new RateLimitedError(err.message);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new LLMUserError(DECLINED_MESSAGE, { status: 422 });
  if (response.stop_reason === "max_tokens") throw new LLMUserError(TRUNCATED_MESSAGE);
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** Run one prompt, falling back across models/providers when one is rate limited. */
export async function callLLM({ system, user, maxTokens = 1500, json = false }) {
  const provider = llmProvider();
  if (!provider) throw new Error("No LLM provider configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY in .env.");
  const prompt = { system, user, maxTokens, json };
  const groq = process.env.GROQ_API_KEY ? groqModels().map((m) => () => callGroq(prompt, m)) : [];
  const anthropic = anthropicKey() ? [() => callAnthropic(prompt, process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL)] : [];
  const attempts = provider === "anthropic" ? [...anthropic, ...groq] : [...groq, ...anthropic];
  let lastLimit;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      if (!(err instanceof RateLimitedError)) throw err;
      console.warn(`[llm] ${err.message.slice(0, 160)} – trying next model`);
      lastLimit = err;
    }
  }
  throw new LLMUserError(BUSY_MESSAGE, { status: 429, cause: lastLimit });
}
