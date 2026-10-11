// The ResumeIQ sticker on LinkedIn job pages: a "Tailor with ResumeIQ" pill in the open job's
// Easy Apply / Save row, sized like LinkedIn's own buttons; clicking it opens the side panel.
// It lives in a shadow root so LinkedIn's styles and ours don't touch; if the job's Save button
// can't be found (LinkedIn changed its layout) there's simply no sticker.
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
   * The open job's Apply and Save buttons: an "Easy Apply" / "Apply" with a Save beside it (the
   * "Easy Apply" search filter has none). { apply, save } or null.
   */
  function jobButtons() {
    const applies = [...document.querySelectorAll("button, a")]
      .filter((b) => visible(b) && !foreign(b) && /^(easy apply|apply)$/i.test(clean(b.innerText)));
    for (const apply of applies) {
      let row = apply.parentElement;
      for (let i = 0; row && row !== document.body && i < 6; i += 1, row = row.parentElement) {
        const save = [...row.querySelectorAll("button")].find((b) => visible(b) && !foreign(b) && /^save\b/i.test(clean(b.innerText)));
        if (save) return { apply, save };
      }
    }
    return null;
  }

  const STYLE = `
    :host { all: initial; display: inline-flex; vertical-align: middle; }
    button { box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: var(--h, 40px); padding: 0 var(--pad, 16px);
      border: 1px solid #3F7D6E; border-radius: 999px; background: #FFFFFF; color: #3F7D6E; cursor: pointer; white-space: nowrap;
      font: 600 var(--fs, 16px)/1 system-ui, -apple-system, "Segoe UI", sans-serif; }
    button:hover { background: #EEF5F2; box-shadow: inset 0 0 0 1px #3F7D6E; }
    button:focus-visible { outline: 2px solid #3F7D6E; outline-offset: 2px; }
    .mark { font-size: 1.05em; }
  `;

  function build() {
    const host = document.createElement("span");
    host.id = HOST_ID;
    host.setAttribute("data-riq-skip", ""); // never read as part of the job
    const root = host.attachShadow({ mode: "open" });
    const pill = Object.assign(document.createElement("button"), { type: "button", title: "Open ResumeIQ: your match, a tailored resume and autofill" });
    pill.innerHTML = '<span class="mark" aria-hidden="true">◈</span>Tailor with ResumeIQ';
    pill.addEventListener("click", () => chrome.runtime.sendMessage({ type: "sticker:open" }).catch(() => {}));
    root.append(Object.assign(document.createElement("style"), { textContent: STYLE }), pill);
    return host;
  }

  /** Match LinkedIn's Save button: its height, text size and side padding, and the gap before it. */
  function matchSave(host, { apply, save }) {
    const box = save.getBoundingClientRect();
    const css = getComputedStyle(save);
    host.style.setProperty("--h", `${Math.round(box.height)}px`);
    host.style.setProperty("--fs", css.fontSize);
    host.style.setProperty("--pad", css.paddingLeft);
    const parentGap = parseFloat(getComputedStyle(save.parentElement).columnGap) || 0;
    const gap = save.getBoundingClientRect().left - apply.getBoundingClientRect().right;
    host.style.marginLeft = parentGap ? "0" : `${Math.max(8, Math.round(gap))}px`;
  }

  let host = null;
  // LinkedIn swaps jobs and re-renders the pane without loading a page: keep the pill in place.
  setInterval(() => {
    const buttons = onJobPage() ? jobButtons() : null;
    if (!buttons) {
      host?.remove();
      return;
    }
    host ||= build();
    if (buttons.save.nextElementSibling !== host) buttons.save.insertAdjacentElement("afterend", host);
    matchSave(host, buttons);
  }, 800);
})();
