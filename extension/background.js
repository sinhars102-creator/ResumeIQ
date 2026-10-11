// Service worker: keeps the ResumeIQ session (from the website, via bridge.js), refreshes it,
// and calls the ResumeIQ API for the side panel.
import { CONFIG } from "./config.js";
import { autoApply } from "./autoApply.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function getSession() {
  return (await chrome.storage.local.get("session")).session || null;
}

async function setSession(session) {
  if (session) await chrome.storage.local.set({ session });
  else await chrome.storage.local.remove("session");
  chrome.runtime.sendMessage({ type: "auth:changed", signedIn: !!session, email: session?.email }).catch(() => {});
}

const fresh = (s) => !!(s?.access_token && s.expires_at && s.expires_at * 1000 > Date.now() + 60_000);

/**
 * The session the ResumeIQ website holds right now, read from an open ResumeIQ tab. The site
 * and the extension share one sign-in, and Supabase replaces the refresh token on every
 * refresh, so whichever side refreshed last holds the only working token.
 */
async function sessionFromOpenApp() {
  const origin = new URL(CONFIG.appUrl).origin;
  const tabs = await chrome.tabs.query({ url: `${origin}/*` }).catch(() => []);
  for (const tab of tabs) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
          return key ? localStorage.getItem(key) : null;
        },
      });
      const s = JSON.parse(res?.result || "null");
      if (s?.access_token) return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, email: s.user?.email };
    } catch {
      // tab not readable (loading, discarded)
    }
  }
  return null;
}

/**
 * A valid access token: the stored one, else the website's current one from an open ResumeIQ
 * tab. The extension never refreshes the session itself: it shares the website's sign-in, and
 * Supabase signs a session out everywhere if an already-replaced refresh token is reused – so
 * only the website (which refreshes automatically while open) renews it.
 */
async function accessToken() {
  const session = await getSession();
  if (fresh(session)) return session.access_token;
  const fromApp = await sessionFromOpenApp();
  if (fresh(fromApp)) {
    await setSession(fromApp);
    return fromApp.access_token;
  }
  return null;
}

/**
 * Bring a ResumeIQ tab forward if it's signed in (it renews the session when shown); otherwise
 * show the site's sign-in box – in that tab, or a new one.
 */
async function openApp() {
  const origin = new URL(CONFIG.appUrl).origin;
  const signInUrl = `${CONFIG.appUrl}?signin=1`;
  const [tab] = await chrome.tabs.query({ url: `${origin}/*` }).catch(() => []);
  if (!tab) {
    await chrome.tabs.create({ url: signInUrl });
    return;
  }
  const session = await sessionFromOpenApp();
  // A session that's merely expired is renewed by the site once shown; none at all needs signing in.
  await chrome.tabs.update(tab.id, session?.refresh_token ? { active: true } : { active: true, url: signInUrl });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

async function api(path, { method = "GET", body } = {}) {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, data: { error: "Sign in on ResumeIQ first" } };
  try {
    const r = await fetch(`${CONFIG.apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } catch (err) {
    return { ok: false, status: 0, data: { error: `Can't reach ResumeIQ (${err.message})` } };
  }
}

const runs = new Map(); // job id → its auto apply's latest state (with the application's tab)


chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "auth:set") {
    getSession().then((current) => {
      // The website's sign-out clears it; a new sign-in replaces it.
      if (!msg.session && current) setSession(null);
      else if (msg.session && msg.session.access_token !== current?.access_token) setSession(msg.session);
    });
    return false;
  }
  if (msg.type === "auth:get") {
    // Picks up the website's session when the stored one has expired.
    accessToken().then(async (token) => {
      const s = await getSession();
      reply({ signedIn: !!token, email: s?.email, appUrl: CONFIG.appUrl });
    });
    return true;
  }
  if (msg.type === "app:open") {
    openApp().then(() => reply(true));
    return true;
  }
  if (msg.type === "api") {
    api(msg.path, msg.options).then(reply);
    return true;
  }
  // The sticker on LinkedIn job pages: open the side panel (straight away – Chrome allows it only in
  // response to the click).
  if (msg.type === "sticker:open" && _sender.tab) {
    chrome.sidePanel.open({ tabId: _sender.tab.id }).catch(() => {});
    return false;
  }
  // Auto apply, started from the ResumeIQ website (via bridge.js); progress goes back to that tab.
  if (msg.type === "autoapply:start" && msg.job?.jobId) {
    const siteTab = _sender.tab?.id;
    const jobId = msg.job.jobId;
    if (runs.get(jobId)?.status === "running") {
      reply({ already: true });
      return false;
    }
    const update = (state) => {
      runs.set(jobId, state);
      if (siteTab != null) chrome.tabs.sendMessage(siteTab, { type: "autoapply:update", jobId, state }).catch(() => {});
    };
    autoApply(msg.job, { api, update }).catch((err) => update({ status: "failed", message: `Auto apply stopped: ${err.message}` }));
    reply({ started: true });
    return false;
  }
  if (msg.type === "autoapply:focus") {
    const tabId = runs.get(msg.jobId)?.tabId;
    if (tabId != null) {
      chrome.tabs.update(tabId, { active: true }).then((t) => chrome.windows.update(t.windowId, { focused: true })).catch(() => {});
    }
    return false;
  }
  return false;
});
