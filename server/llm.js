/**
 * LLM provider switch – the browser sends prompts to POST /api/llm and the
 * server picks the provider, so no model API key reaches the client.
 *
 * Provider: LLM_PROVIDER=groq|anthropic, else Groq when GROQ_API_KEY is set,
 * else Anthropic. Models: GROQ_MODEL / ANTHROPIC_MODEL override the defaults.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RATE_LIMIT_WAIT_MS = 20000;

async function callGroq({ system, user, maxTokens, json }, attempt = 0) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: llmModel(),
      temperature: 0.2,
      // gpt-oss reasons before answering and those tokens share this budget, so leave headroom.
      max_completion_tokens: maxTokens + 2048,
      ...(/gpt-oss/.test(llmModel()) ? { reasoning_effort: "low" } : {}),
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
      console.log(`[llm] Groq rate limit – retrying in ${(waitMs / 1000).toFixed(1)}s`);
      await sleep(waitMs);
      return callGroq({ system, user, maxTokens, json }, attempt + 1);
    }
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || `Groq API error ${response.status}`);
  }
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error(TRUNCATED_MESSAGE);
  return choice?.message?.content || "";
}

async function callAnthropic({ system, user, maxTokens }) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: llmModel(),
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.type === "error") {
    throw new Error(data?.error?.message || data?.message || `Anthropic API error ${response.status}`);
  }
  if (data?.stop_reason === "max_tokens") throw new Error(TRUNCATED_MESSAGE);
  return (data?.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/** Run one prompt on the configured provider and return the text reply. */
export async function callLLM({ system, user, maxTokens = 1500, json = false }) {
  const provider = llmProvider();
  if (!provider) throw new Error("No LLM provider configured. Set GROQ_API_KEY or ANTHROPIC_API_KEY in .env.");
  return provider === "groq"
    ? callGroq({ system, user, maxTokens, json })
    : callAnthropic({ system, user, maxTokens });
}
