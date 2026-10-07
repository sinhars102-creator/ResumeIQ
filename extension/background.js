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

/** A valid access token, refreshing it with Supabase when it's about to expire. */
async function accessToken() {
  const session = await getSession();
  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 > Date.now() + 60_000) return session.access_token;
  const r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseAnonKey },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!r.ok) {
    await setSession(null);
    return null;
  }
  const d = await r.json();
  await setSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, email: d.user?.email || session.email });
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
    getSession().then((s) => reply({ signedIn: !!s, email: s?.email, appUrl: CONFIG.appUrl }));
    return true;
  }
  if (msg.type === "api") {
    api(msg.path, msg.options).then(reply);
    return true;
  }
  return false;
});
