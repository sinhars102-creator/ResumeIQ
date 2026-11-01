/**
 * Product analytics (PostHog). Off unless VITE_POSTHOG_KEY is set.
 *
 * Privacy: resumes are personal data. Autocapture (clicked element text) and surveys are disabled;
 * session recordings mask every form field and all resume content (see initAnalytics). Events carry
 * counts, scores and categories – never resume text, names, contact details or job description
 * text. Visitors get an anonymous ID per browser.
 */
import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY;
let enabled = false;

/** URL parameter carrying the visitor's anonymous ID from an in-app browser to Chrome/Safari (see UploadStep). */
export const HANDOFF_ID_PARAM = "ph_did";

/**
 * The anonymous ID handed over from an in-app browser, removed from the address before the first pageview.
 * Keeping the ID means an upload made after switching to Chrome/Safari counts for the same visitor.
 */
function takeHandoffId() {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get(HANDOFF_ID_PARAM);
    if (!id) return null;
    url.searchParams.delete(HANDOFF_ID_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return /^[\w-]{8,100}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function initAnalytics() {
  if (!key || enabled) return;
  const handoffId = takeHandoffId();
  posthog.init(key, {
    ...(handoffId && { bootstrap: { distinctID: handoffId } }),
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    autocapture: false,
    // Project-level defaults can switch these on remotely; dead clicks and heatmaps record clicked
    // element details, so they stay off in code.
    capture_dead_clicks: false,
    capture_heatmaps: false,
    rageclick: false,
    capture_exceptions: false,
    capture_pageview: true,
    capture_pageleave: true,
    // Session recordings: every form field, plus anything marked data-clarity-mask (resume text, file
    // names), is replaced with asterisks before it leaves the browser. Console logs stay out, as error
    // messages can quote resume text. The resume editor is a separate site in an iframe and isn't recorded.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-clarity-mask]",
    },
    enable_recording_console_log: false,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
  });
  enabled = true;
}

/** This visitor's anonymous ID, or null when analytics is off. */
export function getDistinctId() {
  if (!enabled) return null;
  try {
    return posthog.get_distinct_id() || null;
  } catch {
    return null;
  }
}

/**
 * An experiment flag's variant for this visitor. Reading it records the visitor as exposed, so call it
 * only where they see the change. Resolves to `fallback` when analytics is off, the experiment isn't
 * launched, or flags don't load within 3 seconds (those visitors aren't counted in the experiment).
 */
export function getFlagVariant(flag, fallback) {
  if (!enabled) return Promise.resolve(fallback);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(typeof value === "string" ? value : fallback);
    };
    try {
      // Read the flag (which records the exposure) only if the visitor hasn't already been given the fallback.
      posthog.onFeatureFlags(() => { if (!done) finish(posthog.getFeatureFlag(flag)); });
    } catch {
      finish(fallback);
    }
    setTimeout(() => finish(fallback), 3000);
  });
}

/** Record one product event. Properties must be counts, scores or categories only. */
export function track(event, properties = {}) {
  // Locally, every event is printed to the browser console so you can see exactly what would be sent.
  if (import.meta.env.DEV) console.debug("[analytics]", event, properties);
  if (!enabled) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break the app.
  }
}

/** Bucket a number so events stay coarse (e.g. years of experience). */
export function bucket(value, edges) {
  if (value == null || !Number.isFinite(Number(value))) return "unknown";
  const v = Number(value);
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return i === 0 ? `<${edges[0]}` : `${edges[i - 1]}-${edges[i]}`;
  return `${edges[edges.length - 1]}+`;
}
