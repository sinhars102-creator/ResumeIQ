/**
 * Where each visitor came from, so signups, activation and payments can be split by channel.
 *
 * Read once per page load from the URL (campaign tags, ad click IDs) and the referrer. The first
 * visit's source on this browser is kept in localStorage ("first touch"); the current visit's in
 * sessionStorage ("last touch"). Both go on every analytics event, and are saved on the user's
 * account when they sign in (table public.user_attribution).
 *
 * Privacy: only campaign tags, ad click IDs and the referring *domain* are kept – never the full
 * referrer URL, and nothing typed by the visitor.
 */

const FIRST_KEY = "riq_first_touch";
const LAST_KEY = "riq_last_touch";
const INTERNAL_KEY = "riq_internal";

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
// Ad click IDs. gclid/gbraid/wbraid are kept in full: they're needed to send offline conversions
// (e.g. payments) back to Google Ads later. They identify an ad click, not a person.
const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "gad_source", "gad_campaignid", "li_fat_id", "fbclid", "msclkid", "rdt_cid", "twclid"];

// Our own and test accounts: their activity is marked is_internal so it can be filtered out.
const INTERNAL_EMAILS = new Set([
  "sinharahul21394@gmail.com",
  "sinha.rs102@gmail.com",
  "adeokuliar7@gmail.com",
  "rahul@myresumeiq.io",
]);

const LIVE_HOST = /(^|\.)myresumeiq\.io$/;

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode: attribution lasts for this page only
  }
}

function referrerDomain() {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    const own = window.location.hostname.replace(/^www\./, "");
    return host && host !== own ? host : null;
  } catch {
    return null;
  }
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/** One channel label for a touch: google_ads, google_organic, linkedin, utm_<source>_<medium>, direct… */
export function classifyChannel(t) {
  if (t.gclid || t.gbraid || t.wbraid || t.gad_source) return "google_ads";
  if (t.li_fat_id) return "linkedin_ads";
  if (t.msclkid) return "bing_ads";
  if (t.rdt_cid) return "reddit_ads";
  if (t.utm_source) return `utm_${slug(t.utm_source)}_${t.utm_medium ? slug(t.utm_medium) : "none"}`;
  if (t.fbclid) return "meta";
  const ref = t.referrer_domain || "";
  if (!ref) return "direct";
  if (/chatgpt\.com|openai\.com|perplexity\.ai|gemini\.google\.com|claude\.ai|copilot\.microsoft\.com/.test(ref)) return "ai_assistant";
  if (/(^|\.)google\.[a-z.]+$/.test(ref)) return "google_organic";
  if (/bing\.com|duckduckgo\.com|search\.yahoo\.com/.test(ref)) return "search_organic";
  if (/linkedin\.com|lnkd\.in/.test(ref)) return "linkedin";
  if (/reddit\.com/.test(ref)) return "reddit";
  if (/mail\.google\.com|outlook\.|mail\.yahoo/.test(ref)) return "email";
  if (/facebook\.com|instagram\.com|(^|\.)t\.co$|x\.com|twitter\.com|youtube\.com|whatsapp\.com/.test(ref)) return "social";
  return "referral";
}

let touches = null;

/** Read this page load's source and update first/last touch. Safe to call more than once. */
export function captureTouch() {
  if (touches) return touches;
  if (typeof window === "undefined") return (touches = { first: null, last: null });
  let params;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = new URLSearchParams();
  }
  if (params.get("internal") === "1") {
    try {
      localStorage.setItem(INTERNAL_KEY, "1");
    } catch {
      // ignore
    }
  }
  const t = {};
  for (const k of UTM_KEYS) {
    const v = params.get(k);
    if (v) t[k] = v.slice(0, 100);
  }
  for (const k of CLICK_ID_KEYS) {
    const v = params.get(k);
    if (v) t[k] = v.slice(0, 200);
  }
  const ref = referrerDomain();
  if (ref) t.referrer_domain = ref;
  const fromOutside = Object.keys(t).length > 0;
  t.landing_path = window.location.pathname.slice(0, 100);
  t.channel = classifyChannel(t);
  t.at = new Date().toISOString();

  // Last touch: a new outside source replaces it; otherwise keep this tab-session's source.
  let last = readJson(sessionStorage, LAST_KEY);
  if (fromOutside || !last) {
    last = t;
    writeJson(sessionStorage, LAST_KEY, t);
  }
  let first = readJson(localStorage, FIRST_KEY);
  if (!first) {
    first = t;
    writeJson(localStorage, FIRST_KEY, t);
  }
  touches = { first, last };
  return touches;
}

/** Internal: our own/test accounts, a browser opened once with ?internal=1, or any non-live host. */
export function isInternal(email) {
  if (email && INTERNAL_EMAILS.has(String(email).trim().toLowerCase())) return true;
  if (typeof window !== "undefined" && !LIVE_HOST.test(window.location.hostname)) return true;
  try {
    return localStorage.getItem(INTERNAL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Properties attached to every analytics event (no click-ID values, only whether one was present). */
export function touchProperties() {
  const { first, last } = captureTouch();
  if (!last) return {};
  return {
    channel: last.channel,
    utm_source: last.utm_source ?? null,
    utm_medium: last.utm_medium ?? null,
    utm_campaign: last.utm_campaign ?? null,
    utm_term: last.utm_term ?? null,
    gad_source: last.gad_source ?? null,
    gad_campaignid: last.gad_campaignid ?? null,
    has_gclid: !!(last.gclid || last.gbraid || last.wbraid),
    referrer_domain: last.referrer_domain ?? null,
    landing_path: last.landing_path,
    first_channel: first?.channel ?? last.channel,
  };
}

/** Person properties set once, at the first sign-in: where this user originally came from. */
export function firstTouchPersonProperties() {
  const { first } = captureTouch();
  if (!first) return {};
  return {
    first_channel: first.channel,
    first_utm_source: first.utm_source ?? null,
    first_utm_medium: first.utm_medium ?? null,
    first_utm_campaign: first.utm_campaign ?? null,
    first_gad_campaignid: first.gad_campaignid ?? null,
    first_referrer_domain: first.referrer_domain ?? null,
    first_landing_path: first.landing_path,
    first_seen_at: first.at,
  };
}

/**
 * Save where this user came from on their account (once per user; the first write wins).
 * Needs the user_attribution table (supabase/migrations/20261113000000_user_attribution.sql);
 * until it exists this quietly does nothing.
 */
export async function saveAttribution(supabase, user) {
  if (!supabase || !user?.id) return;
  const flag = `riq_attr_saved_${user.id}`;
  try {
    if (localStorage.getItem(flag)) return;
  } catch {
    // continue
  }
  const { first, last } = captureTouch();
  const clickId = (t) => t?.gclid || t?.gbraid || t?.wbraid || null;
  const row = {
    user_id: user.id,
    first_channel: first?.channel ?? null,
    signup_channel: last?.channel ?? null,
    first_touch: first,
    signup_touch: last,
    gclid: clickId(last) || clickId(first),
    is_internal: isInternal(user.email),
  };
  try {
    const { error } = await supabase.from("user_attribution").upsert(row, { onConflict: "user_id", ignoreDuplicates: true });
    if (!error) localStorage.setItem(flag, "1");
  } catch {
    // Attribution must never break sign-in.
  }
}
