// Functions the side panel runs inside the job page (chrome.scripting.executeScript). Each must
// be self-contained: it is serialised and run in the page, without access to this module.

/**
 * The job on this page: structured job data (schema.org JobPosting, which most job sites and
 * applicant tracking systems publish) first, then LinkedIn's layout, then the page title.
 */
export function extractJob() {
  // Structured data often carries HTML entities ("&amp;"); a textarea decodes them.
  const decode = (t) => {
    const ta = document.createElement("textarea");
    ta.innerHTML = String(t || "");
    return ta.value;
  };
  const clean = (t) => decode(t).replace(/\s+/g, " ").trim();
  const text = (sel) => clean(document.querySelector(sel)?.innerText);
  const htmlText = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return d.innerText.replace(/\n{3,}/g, "\n\n").trim();
  };

  // 1) schema.org JobPosting
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const items = [].concat(data["@graph"] || data);
      const p = items.find((x) => x && [].concat(x["@type"]).includes("JobPosting"));
      if (p) {
        const loc = [].concat(p.jobLocation || []).map((l) => l?.address).filter(Boolean)
          .map((a) => [a.addressLocality, a.addressRegion, a.addressCountry?.name || a.addressCountry].filter(Boolean).join(", "));
        return {
          title: clean(p.title),
          company: clean(p.hiringOrganization?.name),
          location: loc[0] || (p.jobLocationType === "TELECOMMUTE" ? "Remote" : ""),
          description: htmlText(p.description).slice(0, 30000),
          url: location.href,
        };
      }
    } catch {
      // not JSON or not a job posting
    }
  }

  // 2) LinkedIn (job page, or a search with a job open). Its class names change often, so: the
  //    tab title first ("Senior PM - SyncOS | Botsync | LinkedIn"), then elements whose class
  //    names mention job-title / company-name – never inside other extensions' injected cards.
  if (location.hostname.endsWith("linkedin.com")) {
    const injected = (el) => !!el.closest('[id*="jobright" i], [class*="jobright" i], [data-riq-skip]');
    const firstText = (selectors) => {
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const t = clean(el.innerText);
          if (t && !injected(el)) return t;
        }
      }
      return "";
    };
    const parts = clean(document.title).replace(/^\(\d+\)\s*/, "").split(" | ").map((x) => x.trim());
    const fromTitle = parts.length >= 3 && /linkedin/i.test(parts[parts.length - 1]) && !/^jobs?\b|\bjobs$|search/i.test(parts[0]);
    const title = (fromTitle && parts[0]) || firstText([
      '[class*="job-title"] h1', 'h1[class*="job-title"]', '[class*="top-card"] h1', '[class*="job-details"] h1', '[class*="job-details"] h2',
    ]);
    const company = (fromTitle && parts[1]) || firstText(['[class*="company-name"] a', '[class*="company-name"]', '[class*="top-card"] a[href*="/company/"]']);
    const meta = firstText(['[class*="primary-description"]', '[class*="tertiary-description"]', '[class*="top-card"] [class*="description"]']);
    const descEl = document.querySelector('#job-details, [class*="jobs-description__content"], [class*="jobs-box__html-content"]') ||
      [...document.querySelectorAll("h2")].find((h) => /about the job/i.test(h.innerText))?.parentElement;
    return { title, company, location: meta.split("·")[0].trim(), description: clean(descEl?.innerText).slice(0, 30000), url: location.href };
  }

  // 3) Fallback: the page's own sections, then its title ("Job Application for X at Company")
  const pageTitle = clean(document.title);
  const title = text("h1") || clean(document.querySelector('meta[property="og:title"]')?.content) || pageTitle;
  const company =
    pageTitle.match(/\bat\s+(.+?)(?:\s*[|–-].*)?$/i)?.[1] ||
    clean(document.querySelector('meta[property="og:site_name"]')?.content) || "";
  const where = text('.job__location, [class*="job-location"], [class*="jobLocation"], .location');
  const body = document.querySelector('.job__description, [class*="job-description"], [class*="jobDescription"], #content, main, article, [role=main]') || document.body;
  return { title, company: clean(company), location: where, description: clean(body.innerText).slice(0, 15000), url: location.href };
}

/**
 * The application form's fields, in the autofill engine's shape:
 * { id, label, type, required, options?, section }. Each element is tagged data-riq-id so
 * fillForm can find it again. Standard fields get the engine's ids (first_name, email…).
 */
export async function readForm() {
  // Required markers vary: "*" (Greenhouse), "✱" (Lever).
  const clean = (t) => String(t || "").replace(/\s+/g, " ").replace(/\s*[*✱]\s*$/, "").trim();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const labelOf = (el) => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const labelledBy = el.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.innerText).join(" ");
    return clean(
      byFor?.innerText || el.labels?.[0]?.innerText || labelledBy || el.getAttribute("aria-label") ||
      el.closest("fieldset")?.querySelector("legend")?.innerText || el.closest("label")?.innerText || el.placeholder || el.name,
    );
  };
  const canonical = (label, el) => {
    const l = label.toLowerCase();
    if (["first_name", "last_name", "email", "phone"].includes(el.id)) return el.id;
    if (/^first name|given name/.test(l)) return "first_name";
    if (/^last name|surname|family name/.test(l)) return "last_name";
    if (/^(full )?name$|^your name$/.test(l)) return "full_name";
    if (el.type === "email" || /^e-?mail/.test(l)) return "email";
    if (el.type === "tel" || /^(phone|mobile)/.test(l)) return "phone";
    return null;
  };
  const required = (el, label) => el.required || el.getAttribute("aria-required") === "true" || /[*✱]\s*$/.test(el.labels?.[0]?.innerText || label);

  const fields = [];
  const used = new Set();
  let n = 0;
  const add = (el, field) => {
    let id = field.id || `riq-${n++}`;
    if (used.has(id)) id = `${id}-${n++}`;
    used.add(id);
    el.setAttribute("data-riq-id", id);
    fields.push({ ...field, id, section: "application" });
  };

  const groups = new Map(); // radio / checkbox groups by name
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (!visible(el) && el.type !== "file") continue;
    if (el.disabled || ["hidden", "submit", "button", "search", "image", "reset", "password"].includes(el.type)) continue;
    if (el.closest("[data-riq-skip]")) continue;
    const label = labelOf(el);
    if (!label) continue;

    if (el.type === "radio" || el.type === "checkbox") {
      const key = el.name || label;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
      continue;
    }
    if (el.tagName === "SELECT") {
      const options = [...el.options].filter((o) => o.value !== "").map((o) => ({ value: o.value, label: clean(o.text) }));
      add(el, { label, type: "select", required: required(el, label), options });
      continue;
    }
    if (el.type === "file") {
      const isResume = /resume|cv\b/i.test(label) || /resume/i.test(el.id + el.name);
      add(el, { id: isResume ? "resume" : undefined, label, type: "file", required: required(el, label) });
      continue;
    }
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") {
      // Search-box dropdowns open on a mouse press; their options render next to the control.
      const control = el.closest('[class*="control"]') || el;
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      const scope = control.parentElement || document;
      const options = [...scope.querySelectorAll('[role="option"], [class*="option"]')].filter(visible).map((o) => clean(o.innerText)).filter(Boolean);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      el.blur();
      if (options.length) {
        add(el, { label, type: "select", required: required(el, label), options: [...new Set(options)].slice(0, 300).map((o) => ({ value: o, label: o })), combobox: true });
      } else {
        // No list until you type (city search): typed, then the first suggestion is picked.
        add(el, { id: /location|city/i.test(label) ? "location" : undefined, label, type: "text", required: required(el, label), combobox: true, autocomplete: true });
      }
      continue;
    }
    const type = el.tagName === "TEXTAREA" ? "textarea" : el.type === "email" ? "email" : el.type === "tel" ? "phone" : el.type === "url" ? "url" : "text";
    add(el, { id: canonical(label, el) || undefined, label, type, required: required(el, label) });
  }
  for (const [key, els] of groups) {
    const question = clean(els[0].closest("fieldset")?.querySelector("legend")?.innerText) || key;
    const options = els.map((el) => ({ value: el.value || labelOf(el), label: labelOf(el) }));
    els.forEach((el, i) => el.setAttribute("data-riq-option", options[i].value));
    const holder = els[0].closest("fieldset") || els[0].parentElement;
    add(holder, { label: question, type: els[0].type === "radio" ? "select" : options.length === 1 ? "checkbox" : "multiselect", required: els.some((e) => e.required), options, group: true });
  }
  return { fields, url: location.href, title: document.title };
}

/**
 * Fill the fields readForm tagged. answers: { id: { value } }; needsYou: [{ id, reason }];
 * resume: { fileName, base64 } to attach. Returns counts and what couldn't be filled.
 */
export async function fillForm({ fields, answers, needsYou, resume }) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setNative = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const mark = (el, note, ok) => {
    el.style.outline = ok ? "2px solid #3F7D6E" : "2px solid #B7862F";
    el.style.outlineOffset = "2px";
    if (!ok && note) el.title = `ResumeIQ: ${note}`;
  };

  let filled = 0;
  const skipped = [];
  const optional = [];
  for (const field of fields) {
    const el = document.querySelector(`[data-riq-id="${CSS.escape(field.id)}"]`);
    if (!el) continue;
    try {
      if (field.type === "file") {
        if (field.id === "resume" && resume?.base64) {
          const bytes = Uint8Array.from(atob(resume.base64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], resume.fileName, { type: "application/pdf" }));
          el.files = dt.files;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          filled += 1;
        }
        continue;
      }
      const answer = answers[field.id];
      if (!answer || answer.value == null || answer.value === "") {
        // Only required fields are flagged on the page; optional ones are just listed.
        if (field.required) {
          mark(el, needsYou.find((x) => x.id === field.id)?.reason || "Needs your answer", false);
          skipped.push(field.label);
        } else optional.push(field.label);
        continue;
      }
      const value = answer.value;
      if (field.group) {
        for (const v of [].concat(value)) {
          const box = el.querySelector(`[data-riq-option="${CSS.escape(String(v))}"]`);
          if (box && !box.checked) box.click();
        }
      } else if (field.combobox) {
        const control = el.closest('[class*="control"]') || el;
        control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.focus();
        setNative(el, String(value));
        await sleep(field.autocomplete ? 1200 : 400);
        const scope = control.parentElement || document;
        const options = [...scope.querySelectorAll('[role="option"], [class*="option"]')].filter((o) => o.offsetWidth || o.offsetHeight);
        const want = String(value).trim().toLowerCase();
        const textOf = (o) => o.innerText.trim().toLowerCase();
        const pick = field.autocomplete
          ? options[0]
          : options.find((o) => textOf(o) === want) || options.find((o) => textOf(o).startsWith(want)) || options.find((o) => textOf(o).includes(want));
        if (!pick) throw new Error("option not offered");
        pick.click();
      } else {
        setNative(el, String(value));
      }
      mark(el, "", true);
      filled += 1;
    } catch (err) {
      mark(el, err.message, false);
      skipped.push(field.label);
    }
  }
  return { filled, skipped, optional };
}
