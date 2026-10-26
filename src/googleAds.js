// Google Ads: the site tag and the "Sign up" conversion. Loaded only on the live site, so local
// testing never counts as conversions. Ad cookies stay off until the visitor accepts the cookie
// notice (Google Consent Mode); without consent Google still receives cookieless signals.
const ADS_ID = "AW-18537655280";
// From Google Ads → Goals → Conversions → Sign up → Tag setup → event snippet: the part after the
// slash in send_to ("AW-18537655280/<label>"). Until it's set, no conversion is sent.
const SIGNUP_LABEL = "";

const CONSENT_KEY = "riq_ad_consent"; // "granted" | "denied"
const LIVE = typeof window !== "undefined" && /(^|\.)myresumeiq\.io$/.test(window.location.hostname);

function readConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

const granted = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" };
// The tag itself loads from index.html (so Google's tag checker finds it in the page).

/** Whether to show the cookie notice: live site, and the visitor hasn't chosen yet. */
export function needsAdConsent() {
  return LIVE && !readConsent();
}

export function setAdConsent(accepted) {
  try {
    localStorage.setItem(CONSENT_KEY, accepted ? "granted" : "denied");
  } catch {
    // private mode: the choice lasts for this page only
  }
  if (accepted && window.gtag) window.gtag("consent", "update", granted);
}

/**
 * The "Sign up" conversion, for a new account only (created in the last 30 minutes – a returning
 * user signing in again doesn't count), once per account on this browser.
 */
export function trackSignUp(user) {
  if (!LIVE || !SIGNUP_LABEL || !window.gtag || !user?.created_at) return;
  if (Date.now() - Date.parse(user.created_at) > 30 * 60 * 1000) return;
  const key = `riq_signup_sent_${user.id}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // fine – at worst a duplicate on a browser without storage
  }
  window.gtag("event", "conversion", { send_to: `${ADS_ID}/${SIGNUP_LABEL}` });
}
