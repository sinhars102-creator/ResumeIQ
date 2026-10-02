/**
 * Product analytics (PostHog). Off unless VITE_POSTHOG_KEY is set.
 *
 * Privacy: resumes are personal data, so nothing captures page content. Autocapture (clicked
 * element text), session recording and surveys are disabled; only the explicit events below are
 * sent, and their properties are counts, scores and categories – never resume text, names,
 * contact details or job description text. Visitors get an anonymous ID per browser.
 */
import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY;
let enabled = false;

export function initAnalytics() {
  if (!key || enabled) return;
  posthog.init(key, {
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
    disable_session_recording: true,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
  });
  enabled = true;
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
