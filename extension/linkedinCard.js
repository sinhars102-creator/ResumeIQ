// The ResumeIQ match card on LinkedIn job pages: your fit for the job that's open, right under its
// Apply / Save buttons, with "Generate resume" and "Details" (both open the side panel).
// The job is read and scored by background.js (same scorer and cache as the side panel). The card
// lives in a shadow root so LinkedIn's styles and ours don't touch; if the Apply row can't be found
// (LinkedIn changed its layout, job closed) there's simply no card.
(() => {
  if (window.__riqMatchCard) return;
  window.__riqMatchCard = true;

  const HOST_ID = "riq-match-card";
  const READ_DELAY_MS = 1200; // LinkedIn fills the job pane in after the address changes
  const RETRIES = 5;

  let jobId = null; // the LinkedIn job the card is for
  let state = { status: "loading" };
  let host = null;
  let seq = 0;

  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const foreign = (el) => !!el.closest(`#${HOST_ID}, [id*="jobright" i], [class*="jobright" i]`);

  function currentJobId() {
    if (!location.pathname.startsWith("/jobs/")) return null;
    return location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/)?.[1] || new URL(location.href).searchParams.get("currentJobId");
  }

  /** The row holding the open job's Apply and Save buttons (the card goes right under it). */
  function applyRow() {
    const applies = [...document.querySelectorAll("button, a")]
      .filter((b) => visible(b) && !foreign(b) && /^(easy apply|apply)$/i.test(clean(b.innerText)));
    for (const button of applies) {
      let row = button.parentElement;
      for (let i = 0; row && i < 6; i += 1, row = row.parentElement) {
        if ([...row.querySelectorAll("button")].some((b) => /^save\b/i.test(clean(b.innerText)))) return row;
      }
    }
    return null;
  }

  const STYLE = `
    :host { all: initial; display: block; margin: 12px 0; }
    .card { box-sizing: border-box; display: flex; gap: 14px; align-items: center; padding: 12px 14px; border: 1px solid #E6E3DC; border-radius: 12px;
      background: #FFFFFF; color: #1F2A2E; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .ring { flex: none; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 16px; color: #FFFFFF;
      background: conic-gradient(var(--ring, #3F7D6E) calc(var(--pct, 0) * 1%), #2B373B 0); box-shadow: inset 0 0 0 6px #1F2A2E; }
    .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .head { font-weight: 700; }
    .line { color: #5F6B6E; font-size: 13px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .brand { color: #3F7D6E; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    .actions { flex: none; display: flex; flex-direction: column; gap: 6px; }
    button { font: inherit; font-size: 13px; font-weight: 600; min-height: 32px; padding: 4px 12px; border-radius: 999px; cursor: pointer; white-space: nowrap;
      border: 1px solid #D3CFC5; background: #FFFFFF; color: #1F2A2E; }
    button.primary { background: #3F7D6E; border-color: #3F7D6E; color: #FFFFFF; }
    button:focus-visible { outline: 2px solid #3F7D6E; outline-offset: 2px; }
  `;

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const open = (action) => chrome.runtime.sendMessage({ type: "card:open", action }).catch(() => {});

  function render() {
    if (!host) return;
    const root = host.shadowRoot;
    const ring = el("div", { className: "ring" }, "…");
    const head = el("div", { className: "head" });
    const line = el("div", { className: "line" });
    const actions = el("div", { className: "actions" });
    if (state.status === "ok") {
      const m = state.match;
      const tier = m.score >= 75 ? ["Strong match", "#3F7D6E"] : m.score >= 55 ? ["Moderate match", "#B7862F"] : ["Needs alignment", "#B5534A"];
      ring.textContent = `${m.score}%`;
      ring.style.setProperty("--pct", m.score);
      ring.style.setProperty("--ring", tier[1]);
      head.textContent = tier[0];
      line.textContent = m.gaps?.length ? `Holding you back: ${m.gaps[0]}${m.gaps.length > 1 ? ` (+${m.gaps.length - 1} more)` : ""}` : "Nothing major holding you back.";
      actions.append(
        el("button", { className: "primary", textContent: state.hasDraft ? "Open your resume" : "Generate resume", onclick: () => open("generate") }),
        el("button", { textContent: "Details", onclick: () => open("details") }),
      );
    } else if (state.status === "signin") {
      ring.textContent = "–";
      head.textContent = "See how well you fit this job";
      line.textContent = "Sign in to ResumeIQ to get your match score and a resume tailored to it.";
      actions.append(el("button", { className: "primary", textContent: "Sign in", onclick: () => chrome.runtime.sendMessage({ type: "app:open" }).catch(() => {}) }));
    } else if (state.status === "error") {
      ring.textContent = "!";
      head.textContent = "Couldn't check your fit";
      line.textContent = state.message || "Something went wrong.";
      actions.append(el("button", { textContent: "Try again", onclick: () => load({ force: true }) }));
    } else {
      head.textContent = "Checking your fit…";
      line.textContent = "Comparing this job with your resume.";
    }
    const card = el("div", { className: "card" }, ring, el("div", { className: "body" }, el("div", { className: "brand", textContent: "ResumeIQ" }), head, line), actions);
    root.replaceChildren(el("style", { textContent: STYLE }), card);
  }

  /** Put the card under the Apply row (again, when LinkedIn re-renders the pane). */
  function place() {
    const row = applyRow();
    if (!row) {
      host?.remove();
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.setAttribute("data-riq-skip", ""); // never read as part of the job
      host.attachShadow({ mode: "open" });
      render();
    }
    if (row.nextElementSibling !== host) row.insertAdjacentElement("afterend", host);
  }

  async function load({ force = false } = {}) {
    const mine = ++seq;
    state = { status: "loading" };
    render();
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      const reply = await chrome.runtime.sendMessage({ type: "card:match", force }).catch(() => null);
      if (mine !== seq) return; // another job is open now
      if (reply?.status === "waiting") {
        await new Promise((r) => setTimeout(r, 1500)); // the description hasn't loaded yet
        continue;
      }
      state = reply || { status: "error", message: "The extension didn't answer – reload the page." };
      render();
      return;
    }
    state = { status: "error", message: "This job's description didn't load." };
    render();
  }

  setInterval(() => {
    const id = currentJobId();
    if (!id) {
      jobId = null;
      host?.remove();
      return;
    }
    if (id !== jobId) {
      jobId = id;
      const mine = ++seq;
      state = { status: "loading" };
      render();
      setTimeout(() => mine === seq && load(), READ_DELAY_MS);
    }
    place();
  }, 800);

  // The side panel generated a resume or the score changed: show it.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "card:refresh" && jobId) load();
  });
})();
