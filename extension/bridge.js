// Runs on the ResumeIQ website: hands the signed-in session to the extension, so there's no
// separate login. Supabase keeps it in localStorage under "sb-<project>-auth-token".
// Also relays auto apply between the page and the extension (window messages <-> runtime messages).
(() => {
  let last = "";
  const send = () => {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    const raw = key ? localStorage.getItem(key) : null;
    if (raw === last) return;
    last = raw;
    let session = null;
    try {
      const s = JSON.parse(raw || "null");
      if (s?.access_token) session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at, email: s.user?.email };
    } catch {
      session = null;
    }
    chrome.runtime.sendMessage({ type: "auth:set", session }).catch(() => {});
  };
  send();
  window.addEventListener("storage", send);
  // The site renews the session when it's shown again: pass the new one on straight away.
  document.addEventListener("visibilitychange", () => setTimeout(send, 1500));
  setInterval(send, 5000); // sign-in / sign-out in this same tab doesn't fire "storage"
})();

(() => {
  const toPage = (data) => window.postMessage({ source: "resumeiq-ext", ...data }, location.origin);
  // The page asks: is the extension here? / start auto apply / show the application tab.
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "resumeiq-app") return;
    const { type, job, jobId } = event.data;
    if (type === "ext:ping") toPage({ type: "ext:ready" });
    else if (type === "autoapply:start") chrome.runtime.sendMessage({ type: "autoapply:start", job }).catch(() => toPage({ type: "autoapply:update", jobId: job?.jobId, state: { status: "failed", message: "The extension didn't respond – reload it and try again." } }));
    else if (type === "autoapply:focus") chrome.runtime.sendMessage({ type: "autoapply:focus", jobId }).catch(() => {});
  });
  // Progress from the extension, passed to the page.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "autoapply:update") toPage(msg);
  });
  toPage({ type: "ext:ready" });
})();
