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

  /** The open job's title: from the tab title ("AI Product Manager | Transsion | LinkedIn"). */
  const jobTitle = () => {
    const parts = clean(document.title).replace(/^\(\d+\)\s*/, "").split(" | ");
    return parts.length >= 3 ? parts[0] : "";
  };

  /**
   * The open job's header block: from its Apply button – the one with Save next to it (not the
   * "Easy Apply" search filter) – the smallest element that also holds the job's title (an h1, or
   * the title text), but not the description below ("About the job"). The sticker goes after it.
   * { header, apply } or null.
   */
  function jobHeader() {
    const title = jobTitle().toLowerCase();
    const holdsTitle = (el) => !!el.querySelector("h1") || (title && clean(el.innerText).toLowerCase().includes(title));
    const holdsDescription = (el) => [...el.querySelectorAll("h2, h3")].some((h) => /^about the job$/i.test(clean(h.innerText)));
    const applies = [...document.querySelectorAll("button, a")]
      .filter((b) => visible(b) && !foreign(b) && /^(easy apply|apply)$/i.test(clean(b.innerText)));
    for (const apply of applies) {
      const hasSave = (el) => [...el.querySelectorAll("button")].some((b) => /^save\b/i.test(clean(b.innerText)));
      let row = apply.parentElement;
      for (let i = 0; row && i < 6 && !hasSave(row); i += 1) row = row.parentElement;
      if (!row || row === document.body || !hasSave(row)) continue; // no Save beside it: not the job's Apply
      for (let el = row, i = 0; el && el !== document.body && i < 12; el = el.parentElement, i += 1) {
        if (!holdsTitle(el)) continue;
        if (!holdsDescription(el)) return { header: el, apply };
        break;
      }
    }
    return null;
  }

  const STYLE = `
    :host { all: initial; display: block; }
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

  const GAP = 12; // px between the sticker and the buttons above it
  let host = null;

  /** The header's content edges (inside its padding and border). */
  function contentBox(el) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) };
  }

  /** Nudge the sticker's margins (from where it actually is) so it spans the job text, GAP below the buttons. */
  function align({ header, apply }) {
    const px = (k) => parseFloat(host.style[k]) || 0;
    const right = contentBox(header).right;
    let box = host.getBoundingClientRect();
    host.style.marginLeft = `${Math.round(px("marginLeft") + apply.getBoundingClientRect().left - box.left)}px`;
    box = host.getBoundingClientRect();
    host.style.marginRight = `${Math.round(px("marginRight") + box.right - right)}px`;
    box = host.getBoundingClientRect();
    host.style.marginTop = `${Math.max(0, Math.round(px("marginTop") + apply.getBoundingClientRect().bottom + GAP - box.top))}px`;
    host.style.marginBottom = `${GAP}px`;
  }

  /**
   * Does it look right where it is: full width of the job text, lined up with it, below the buttons,
   * one card tall – and not running into what follows (inside the header: within the header's box,
   * which can be shorter than its contents; after it: above the next section)?
   */
  function looksRight({ header, apply }) {
    const box = host.getBoundingClientRect();
    const a = apply.getBoundingClientRect();
    const width = contentBox(header).right - a.left;
    const limit = header.contains(host)
      ? header.getBoundingClientRect().bottom
      : host.nextElementSibling ? host.nextElementSibling.getBoundingClientRect().top : Infinity;
    return box.width >= 0.6 * width && Math.abs(box.left - a.left) <= 4 && box.top >= a.bottom + GAP / 2 && box.height <= 160 && box.bottom <= limit + 1;
  }

  /**
   * Put the sticker in the job header (as its last item), else right after it – whichever ends up
   * looking right once aligned. LinkedIn's layout isn't known in advance (the header can sit in a row,
   * be shorter than its buttons…), so each spot is tried and measured; if neither works, no sticker.
   */
  function place(found) {
    const spots = [() => found.header.appendChild(host), () => found.header.insertAdjacentElement("afterend", host)];
    for (const put of spots) {
      put();
      // Its own line in any layout: a full-width flex item, a grid item spanning all columns.
      Object.assign(host.style, { margin: "0", flex: "0 0 100%", gridColumn: "1 / -1", alignSelf: "stretch", width: "auto" });
      align(found);
      if (looksRight(found)) return true;
    }
    host.remove();
    return false;
  }

  // LinkedIn swaps jobs and re-renders the pane without loading a page: keep the sticker in place.
  setInterval(() => {
    const found = onJobPage() ? jobHeader() : null;
    if (!found) {
      host?.remove();
      return;
    }
    host ||= build();
    if (host.isConnected && looksRight(found)) return; // still fine where it is
    place(found);
  }, 800);
})();
