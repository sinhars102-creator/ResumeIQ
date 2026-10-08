// Service worker: keeps the ResumeIQ session (from the website, via bridge.js), refreshes it,
// and calls the ResumeIQ API for the side panel.
import { CONFIG } from "./config.js";

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

/** A valid access token: the stored one, the website's current one, or a refreshed one. */
async function accessToken() {
  const session = await getSession();
  if (fresh(session)) return session.access_token;
  const fromApp = await sessionFromOpenApp();
  if (fresh(fromApp)) {
    await setSession(fromApp);
    return fromApp.access_token;
  }
  if (!session && !fromApp) return null;
  const refreshToken = fromApp?.refresh_token || session.refresh_token;
  const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseAnonKey },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!r.ok) {
    // The website may have refreshed in the meantime: one last look before signing out.
    const again = await sessionFromOpenApp();
    if (fresh(again)) {
      await setSession(again);
      return again.access_token;
    }
    await setSession(null);
    return null;
  }
  const d = await r.json();
  await setSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, email: d.user?.email || session?.email || fromApp?.email });
  return d.access_token;
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
    // Refreshes (or picks up the website's session) when the stored one has expired.
    accessToken().then(async () => {
      const s = await getSession();
      reply({ signedIn: !!s, email: s?.email, appUrl: CONFIG.appUrl });
    });
    return true;
  }
  if (msg.type === "api") {
    api(msg.path, msg.options).then(reply);
    return true;
  }
  return false;
});
