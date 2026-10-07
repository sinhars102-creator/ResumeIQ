// Runs on the ResumeIQ website: hands the signed-in session to the extension, so there's no
// separate login. Supabase keeps it in localStorage under "sb-<project>-auth-token".
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
  setInterval(send, 5000); // sign-in / sign-out in this same tab doesn't fire "storage"
})();
