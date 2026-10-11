// The ResumeIQ sticker on LinkedIn job pages: a small card below the open job's header (title,
// details, Apply / Save) inviting the user to open ResumeIQ; clicking it opens the side panel.
// It lives in a shadow root so LinkedIn's styles and ours don't touch; if the job header can't be
// found (LinkedIn changed its layout) there's simply no sticker.
(() => {
  if (window.__riqSticker) return;
  window.__riqSticker = true;

  const HOST_ID = "riq-sticker";
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const foreign = (el) => !!el.closest(`#${HOST_ID}, [id*="jobright" i], [class*="jobright" i]`);
  const onJobPage = () => location.pathname.startsWith("/jobs/") &&
    (/\/jobs\/view\//.test(location.pathname) || new URL(location.href).searchParams.has("currentJobId"));

  /**
   * The open job's header block: the smallest element holding both its title (h1) and its Apply
   * button, but not the description below ("About the job"). The sticker goes right after it.
   */
  function jobHeader() {
    const apply = [...document.querySelectorAll("button, a")]
      .find((b) => visible(b) && !foreign(b) && /^(easy apply|apply)$/i.test(clean(b.innerText)));
    for (let el = apply?.parentElement, i = 0; el && el !== document.body && i < 12; el = el.parentElement, i += 1) {
      if (!el.querySelector("h1")) continue;
      const holdsDescription = [...el.querySelectorAll("h2, h3")].some((h) => /^about the job$/i.test(clean(h.innerText)));
      return holdsDescription ? null : el;
    }
    return null;
  }

  const STYLE = `
    :host { all: initial; display: block; margin: 16px 0 4px; }
    .sticker { box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; text-align: left;
      border: 1px solid #CFE0DA; border-radius: 12px; background: linear-gradient(90deg, #EEF5F2, #FFFFFF); color: #1F2A2E;
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .sticker:hover { border-color: #3F7D6E; }
    .sticker:focus-visible { outline: 2px solid #3F7D6E; outline-offset: 2px; }
    .mark { flex: none; width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: #3F7D6E; color: #FFFFFF; font-size: 16px; }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .title { font-weight: 700; }
    .sub { color: #5F6B6E; font-size: 13px; }
    .cta { flex: none; padding: 6px 14px; border-radius: 999px; background: #3F7D6E; color: #FFFFFF; font-weight: 600; font-size: 13px; white-space: nowrap; }
  `;

  function build() {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("data-riq-skip", ""); // never read as part of the job
    const root = host.attachShadow({ mode: "open" });
    const sticker = Object.assign(document.createElement("button"), { type: "button", className: "sticker" });
    sticker.innerHTML = `
      <span class="mark" aria-hidden="true">◈</span>
      <span class="text"><span class="title">Tailor your resume for this job with ResumeIQ</span>
        <span class="sub">See your match, get a tailored resume and autofill the application.</span></span>
      <span class="cta">Open ResumeIQ</span>`;
    sticker.addEventListener("click", () => chrome.runtime.sendMessage({ type: "sticker:open" }).catch(() => {}));
    root.append(Object.assign(document.createElement("style"), { textContent: STYLE }), sticker);
    return host;
  }

  let host = null;
  // LinkedIn swaps jobs and re-renders the pane without loading a page: keep the sticker in place.
  setInterval(() => {
    const header = onJobPage() ? jobHeader() : null;
    if (!header) {
      host?.remove();
      return;
    }
    host ||= build();
    if (header.nextElementSibling !== host) header.insertAdjacentElement("afterend", host);
  }, 800);
})();
