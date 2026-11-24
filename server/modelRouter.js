/**
 * Module M6 – which model does which job, and what it costs.
 *
 * Tasks (named by the caller of callLLM):
 *   extract  – turning resume or job text into structured data
 *   command  – understanding a chat message / short classification
 *   write    – writing and rewriting resume lines
 *   general  – everything else
 *
 * Each task can be pointed at its own provider and model with environment variables, no code change:
 *   LLM_WRITE_PROVIDER=anthropic   LLM_WRITE_MODEL=claude-haiku-5-5
 *   LLM_EXTRACT_PROVIDER=groq      LLM_EXTRACT_MODEL=openai/gpt-oss-120b
 * Unset = the default provider and model from server/llm.js.
 *
 * Spend: every call's tokens are priced and added to a per-day total. When a day's total passes
 * LLM_DAILY_ALERT_USD (default 25) a warning is logged once, and posted to LLM_ALERT_WEBHOOK if set
 * (a Slack or Discord incoming-webhook URL). It only alerts; it never blocks users.
 * Prices are per million tokens in USD, taken from public price lists; override with LLM_PRICES
 * (JSON: {"model-name":[inputPrice,outputPrice]}) when a provider changes its prices.
 */

export const TASKS = ["extract", "command", "write", "general"];

const PROVIDERS = new Set(["groq", "anthropic"]);

/** { provider, model } chosen for a task by the environment; either may be null (use the default). */
export function resolveRoute(task, env = process.env) {
  const key = String(TASKS.includes(task) ? task : "general").toUpperCase();
  const provider = String(env[`LLM_${key}_PROVIDER`] || "").toLowerCase();
  return { provider: PROVIDERS.has(provider) ? provider : null, model: String(env[`LLM_${key}_MODEL`] || "").trim() || null };
}

// [input, output] USD per million tokens. Approximate public list prices; the last two are estimates.
const PRICES = [
  [/gpt-oss-120b/, [0.15, 0.6]],
  [/gpt-oss-20b/, [0.1, 0.5]],
  [/llama-3\.1-8b|llama3\.1-8b/, [0.05, 0.08]],
  [/llama-3\.3-70b|llama3\.3-70b/, [0.59, 0.79]],
  [/claude-haiku/, [1, 5]],
  [/claude-sonnet/, [3, 15]],
  [/claude-opus/, [5, 25]],
  [/qwen/, [0.3, 0.6]],
];
const FALLBACK_PRICE = [1, 5];

export function priceFor(model, env = process.env) {
  try {
    const custom = env.LLM_PRICES ? JSON.parse(env.LLM_PRICES) : null;
    if (custom && Array.isArray(custom[model])) return custom[model];
  } catch {
    // A malformed LLM_PRICES is ignored; the built-in prices apply.
  }
  return PRICES.find(([re]) => re.test(String(model)))?.[1] || FALLBACK_PRICE;
}

/** USD cost of one call. */
export function costOf(model, tokensIn = 0, tokensOut = 0, env = process.env) {
  const [pin, pout] = priceFor(model, env);
  return (tokensIn * pin + tokensOut * pout) / 1_000_000;
}

const dayKey = (d) => d.toISOString().slice(0, 10);
const blank = () => ({ costUsd: 0, calls: 0, tokensIn: 0, tokensOut: 0, byTask: {}, byModel: {}, alerted: false });

export function createSpendTracker({ alertUsd = Number(process.env.LLM_DAILY_ALERT_USD) || 25, now = () => new Date(), onAlert = () => {}, env = process.env } = {}) {
  const days = new Map();
  const bucket = (key) => (days.has(key) ? days.get(key) : (days.set(key, blank()), days.get(key)));
  return {
    /** Add one call; returns its cost. Calls with no usage data count as a call with no cost. */
    record({ task = "general", model = "unknown", tokensIn = 0, tokensOut = 0 }) {
      const cost = costOf(model, tokensIn, tokensOut, env);
      const day = bucket(dayKey(now()));
      day.costUsd += cost;
      day.calls += 1;
      day.tokensIn += tokensIn;
      day.tokensOut += tokensOut;
      const t = (day.byTask[task] ||= { costUsd: 0, calls: 0 });
      t.costUsd += cost;
      t.calls += 1;
      const m = (day.byModel[model] ||= { costUsd: 0, calls: 0 });
      m.costUsd += cost;
      m.calls += 1;
      if (!day.alerted && alertUsd > 0 && day.costUsd >= alertUsd) {
        day.alerted = true;
        onAlert({ day: dayKey(now()), costUsd: day.costUsd, alertUsd, byTask: day.byTask, byModel: day.byModel });
      }
      return cost;
    },
    summary(key = dayKey(now())) {
      const d = days.get(key) || blank();
      return { day: key, costUsd: Math.round(d.costUsd * 1e6) / 1e6, calls: d.calls, tokensIn: d.tokensIn, tokensOut: d.tokensOut, byTask: d.byTask, byModel: d.byModel, alertUsd };
    },
  };
}

/** The server's shared tracker: logs and (optionally) posts to a webhook when the day's alert level is passed. */
export const spend = createSpendTracker({
  onAlert: (info) => {
    const text = `ResumeIQ AI spend today is $${info.costUsd.toFixed(2)}, past the $${info.alertUsd} alert level.`;
    console.warn(`[llm-spend] ${text}`);
    if (process.env.LLM_ALERT_WEBHOOK) {
      fetch(process.env.LLM_ALERT_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text }) }).catch(() => {});
    }
  },
});
