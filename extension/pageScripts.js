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
    // Location: the line under the title, "Bengaluru, Karnataka, India · 1 week ago · Over 100 …".
    const AGO = /·\s*(reposted\s+)?\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago/i;
    const metaLine = [...document.querySelectorAll("span, div, p")]
      .filter((el) => !injected(el) && el.children.length < 12 && AGO.test(el.innerText || ""))
      .map((el) => clean(el.innerText))
      .filter((t) => /^[^·]{2,}·/.test(t)) // the place comes before the first "·"
      .sort((a, b) => a.length - b.length)[0];
    const meta = metaLine || firstText(['[class*="primary-description"]', '[class*="tertiary-description"]']);

    // Description: the longest of LinkedIn's description containers, or the block that grows
    // out of the "About the job" heading until it holds the text (the heading alone is ~13 chars).
    // A block holding the title header (h1) is the whole job pane, not the description.
    const usable = (el) => el && !injected(el) && !el.querySelector("h1");
    const heading = [...document.querySelectorAll("h2, h3")].find((h) => /^about the job$/i.test(clean(h.innerText)) && !injected(h));
    let aroundHeading = "";
    for (let el = heading?.parentElement, i = 0; el && i < 6; el = el.parentElement, i += 1) {
      if (!usable(el)) break;
      const t = clean(el.innerText);
      if (t.length > 200) {
        aroundHeading = t;
        break;
      }
    }
    const fromContainers = [...document.querySelectorAll('#job-details, [class*="jobs-description"], [class*="job-details-module"], [class*="description__text"]')]
      .filter(usable)
      .map((el) => clean(el.innerText))
      .filter((t) => t.length < 40000)
      .sort((a, b) => b.length - a.length)[0] || "";
    const best = aroundHeading.length >= fromContainers.length ? aroundHeading : fromContainers;
    const description = best.replace(/^about the job\s*/i, "").slice(0, 30000);
    return { title, company, location: meta.split("·")[0].trim(), description, url: location.href };
  }

  // 3) Fallback: the page's own sections, then its title ("Job Application for X at Company")
  const pageTitle = clean(document.title);
  const title = text("h1") || clean(document.querySelector('meta[property="og:title"]')?.content) || pageTitle;
  // Company: "… at Company" in the tab title, the site name, the tab title's other part
  // ("Eloelo - Careers"), the logo's alt text, then the web address (eloelo.keka.com,
  // careers.eloelo.com → "Eloelo").
  const fromAddress = () => {
    const generic = new Set(["www", "careers", "career", "jobs", "job", "apply", "hire", "hiring", "recruit", "talent", "work", "join",
      "keka", "greenhouse", "lever", "ashbyhq", "workable", "myworkdayjobs", "workday", "smartrecruiters", "darwinbox", "zohorecruit",
      "freshteam", "breezy", "recruitee", "bamboohr", "com", "co", "in", "io", "ai", "net", "org", "app"]);
    const label = location.hostname.toLowerCase().split(".").find((p) => !generic.has(p) && p.length > 1);
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
  };
  const titleParts = pageTitle.split(/\s+[|–—-]\s+/).map(clean).filter(Boolean);
  const titleCompany = titleParts.find((p) => !/careers?|jobs?|apply|opening|position|hiring/i.test(p) && p.toLowerCase() !== text("h1").toLowerCase());
  const logoAlt = clean([...document.querySelectorAll("header img[alt], nav img[alt], img[alt*='logo' i]")].map((i) => i.alt).find((a) => a && a.length < 40))
    .replace(/\s*logo\s*/i, "");
  const company =
    pageTitle.match(/\bat\s+(.+?)(?:\s*[|–-].*)?$/i)?.[1] ||
    clean(document.querySelector('meta[property="og:site_name"]')?.content) ||
    titleCompany || logoAlt || fromAddress();
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

  /** Text of the nearest container around an element (for unlabelled upload boxes). */
  const contextText = (el) => {
    for (let node = el.parentElement, i = 0; node && i < 4; node = node.parentElement, i += 1) {
      const t = clean(node.innerText);
      if (t) return t.slice(0, 160);
    }
    return "";
  };

  /** Text a little further out (up to 8 levels, short containers only) – the upload's section heading. */
  const widerText = (el) => {
    for (let node = el.parentElement, i = 0; node && i < 8; node = node.parentElement, i += 1) {
      const t = clean(node.innerText);
      if (t.length > 400) break;
      if (/resume|\bcv\b|curriculum|cover(ing)? letter/i.test(t)) return t.slice(0, 200);
    }
    return "";
  };
  const singleUpload = [...document.querySelectorAll('input[type="file"]')].length === 1 &&
    /resume|\bcv\b|curriculum vitae/i.test(document.body.innerText.slice(0, 20000));

  // Employment: each "Company" field marks one job block – the largest container around it that holds
  // no other job and none of the form's other questions. Fields inside are tagged with the job's
  // place on the page, so the engine fills block 1 from the first job in the resume, and so on.
  const COMPANY = /^(current |previous )?(company|employer|organi[sz]ation)( name)?$/i;
  const OUTSIDE = /first name|last name|given name|family name|e-?mail|phone|school|university|college|degree|resume|\bcv\b|linkedin/i;
  const controls = [...document.querySelectorAll("input, select, textarea")].filter((el) => visible(el) && !["hidden", "file"].includes(el.type));
  const companyFields = controls.filter((el) => COMPANY.test(labelOf(el)));
  const jobBlocks = companyFields.map((anchor) => {
    let block = anchor;
    for (let up = block.parentElement; up && up !== document.body; up = up.parentElement) {
      const inside = controls.filter((el) => up.contains(el));
      if (inside.filter((el) => companyFields.includes(el)).length > 1 || inside.length > 14 || inside.some((el) => OUTSIDE.test(labelOf(el)))) break;
      block = up;
    }
    return block;
  }).filter((block) => {
    const labels = controls.filter((el) => block.contains(el)).map(labelOf);
    return labels.some((l) => /title|role|position|designation/i.test(l)) && labels.some((l) => /start|from|date|year/i.test(l));
  });
  const entryOf = (el) => {
    const index = jobBlocks.findIndex((b) => b.contains(el));
    return index < 0 ? undefined : { kind: "employment", index };
  };

  const fields = [];
  const used = new Set();
  let n = 0;
  const add = (el, field) => {
    let id = field.id || `riq-${n++}`;
    if (used.has(id)) id = `${id}-${n++}`;
    used.add(id);
    el.setAttribute("data-riq-id", id);
    const entry = entryOf(el);
    fields.push({ ...field, id, section: "application", ...(entry ? { entry } : {}) });
  };

  const groups = new Map(); // radio / checkbox groups by name
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (!visible(el) && el.type !== "file") continue;
    if (el.disabled || ["hidden", "submit", "button", "search", "image", "reset", "password"].includes(el.type)) continue;
    if (el.closest("[data-riq-skip]")) continue;
    // Upload boxes are often a drop zone with no label: use the text around the hidden file input.
    const label = labelOf(el) || (el.type === "file" ? contextText(el) : "");
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
      const around = `${label} ${contextText(el)} ${el.id} ${el.name} ${el.getAttribute("data-automation-id") || ""} ${widerText(el)}`;
      let id;
      if (/resume|\bcv\b|curriculum/i.test(around) && !used.has("resume")) id = "resume";
      else if (/cover(ing)? letter/i.test(around) && !used.has("cover_letter")) id = "cover_letter";
      else if (/additional|attachment|other documents|supporting/i.test(around) && !used.has("cover_letter") && !used.has("documents")) id = "documents";
      else if (singleUpload && !used.has("resume")) id = "resume"; // the page's only upload, on a page about a resume/CV
      add(el, { id, label: clean(label).slice(0, 120), type: "file", required: required(el, label) });
      continue;
    }
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete") === "list") {
      // Search-box dropdowns open on a mouse press – or, where that's ignored (Greenhouse's newer
      // forms), on a touch. Their options are in the list the box points to, else next to it.
      const control = el.closest('[class*="control"]') || el;
      const menuOptions = () => {
        const list = document.getElementById(el.getAttribute("aria-controls") || "");
        if (list) return [...list.querySelectorAll('[role="option"]')];
        return [...(control.parentElement || document).querySelectorAll('[role="option"], [class*="option"]')].filter(visible);
      };
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      if (!menuOptions().length) {
        control.dispatchEvent(new Event("touchend", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
      }
      const options = menuOptions().map((o) => clean(o.innerText)).filter(Boolean);
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
  // Button-style dropdowns (Workday) can't be filled yet: tagged so fillForm flags the empty ones.
  for (const el of document.querySelectorAll('button[aria-haspopup="listbox"]')) {
    if (!visible(el) || el.closest("[data-riq-skip]")) continue;
    const label = labelOf(el) || clean(el.getAttribute("aria-label"));
    if (label) el.setAttribute("data-riq-manual", label);
  }
  for (const [key, els] of groups) {
    const question = clean(els[0].closest("fieldset")?.querySelector("legend")?.innerText) || (els.length === 1 ? labelOf(els[0]) : "") || key;
    const options = els.map((el) => ({ value: el.value || labelOf(el), label: labelOf(el) }));
    els.forEach((el, i) => el.setAttribute("data-riq-option", options[i].value));
    const holder = els[0].closest("fieldset") || els[0].parentElement;
    add(holder, { label: question, type: els[0].type === "radio" ? "select" : options.length === 1 ? "checkbox" : "multiselect", required: els.some((e) => e.required), options, group: true });
  }
  return { fields, manual: document.querySelectorAll("[data-riq-manual]").length, url: location.href, title: document.title };
}

/**
 * Fill the fields readForm tagged. answers: { id: { value } }; needsYou: [{ id, reason }];
 * resume / coverLetter: { fileName, base64 } to attach. Returns counts and what couldn't be filled.
 */
export async function fillForm({ fields, answers, needsYou, resume, coverLetter }) {
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
  const attach = (el, file) => {
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], file.fileName, { type: file.mimeType || "application/pdf" }));
    el.files = dt.files;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // Files first: some sites read an uploaded resume and fill the form from it, which would
  // overwrite answers filled before it.
  let attachedAny = false;
  for (const field of fields.filter((f) => f.type === "file")) {
    const el = document.querySelector(`[data-riq-id="${CSS.escape(field.id)}"]`);
    const file = field.id === "resume" ? resume : field.id === "cover_letter" || field.id === "documents" ? coverLetter : null;
    if (!el || !file?.base64) continue;
    try {
      attach(el, file);
      filled += 1;
      attachedAny = true;
    } catch {
      skipped.push(field.label);
    }
  }
  if (attachedAny) await sleep(3000);
  const flagged = []; // [element, label] of fields left for the user
  for (const field of fields) {
    const el = document.querySelector(`[data-riq-id="${CSS.escape(field.id)}"]`);
    if (!el || el.disabled) continue; // greyed out (e.g. end date of a current job)
    try {
      if (field.type === "file") continue; // attached above
      const answer = answers[field.id];
      if (answer?.blank) continue; // deliberately empty (e.g. "Current role" for a past job)
      if (!answer || answer.value == null || answer.value === "") {
        // Only required fields are flagged on the page; optional ones are just listed.
        if (field.required) {
          mark(el, needsYou.find((x) => x.id === field.id)?.reason || "Needs your answer", false);
          skipped.push(field.label);
          flagged.push([el, field.label]);
        } else optional.push(field.label);
        continue;
      }
      const value = answer.value;
      if (field.group) {
        for (const v of [].concat(value)) {
          const box = el.querySelector(`[data-riq-option="${CSS.escape(String(v))}"]`);
          if (box && !box.checked) box.click();
        }
      } else if (field.combobox && !field.autocomplete) {
        // Open the list (mouse press, else touch – see readForm) and click the matching option.
        const control = el.closest('[class*="control"]') || el;
        const menuOptions = () => {
          const list = document.getElementById(el.getAttribute("aria-controls") || "");
          if (list) return [...list.querySelectorAll('[role="option"]')];
          return [...(control.parentElement || document).querySelectorAll('[role="option"], [class*="option"]')].filter((o) => o.offsetWidth || o.offsetHeight);
        };
        control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        await sleep(300);
        if (!menuOptions().length) {
          control.dispatchEvent(new Event("touchend", { bubbles: true }));
          await sleep(300);
        }
        const want = String(value).trim().toLowerCase();
        const textOf = (o) => o.innerText.trim().toLowerCase();
        const options = menuOptions();
        const pick = options.find((o) => textOf(o) === want) || options.find((o) => textOf(o).startsWith(want)) || options.find((o) => textOf(o).includes(want));
        if (!pick) {
          el.blur();
          throw new Error("option not offered");
        }
        pick.click();
        await sleep(150);
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
  // Fields that became greyed out while filling (ticking "Current role" disables the end date) aren't asked of the user.
  for (const [el, label] of flagged) {
    if (!el.disabled) continue;
    el.style.outline = "";
    skipped.splice(skipped.indexOf(label), 1);
  }
  // Dropdowns autofill can't operate yet (button-style): flag the ones still unanswered.
  for (const el of document.querySelectorAll("[data-riq-manual]")) {
    const shown = el.innerText.replace(/\s+/g, " ").trim();
    if (shown && !/^(select|choose|--|please select)/i.test(shown)) continue;
    mark(el, "Pick this one on the page", false);
    skipped.push(`${el.getAttribute("data-riq-manual")} (pick on the page)`);
  }
  return { filled, skipped, optional };
}

/**
 * Make the form show `wanted` employment blocks by clicking its "Add another" / "Add" button in the
 * employment section (only when at least one block is already there). Returns how many there are.
 */
export async function expandEmployment(wanted) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (t) => String(t || "").replace(/\s+/g, " ").replace(/\s*[*✱]\s*$/, "").trim();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const labelOf = (el) => {
    const byFor = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    const labelledBy = el.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.innerText).join(" ");
    return clean(byFor?.innerText || el.labels?.[0]?.innerText || labelledBy || el.getAttribute("aria-label") || el.placeholder || el.name);
  };
  const COMPANY = /^(current |previous )?(company|employer|organi[sz]ation)( name)?$/i;
  const EDUCATION = /school|university|college|institution|degree/i;
  // A job block: the company field plus title and date fields close around it (a standalone
  // "Current Company" question has neither).
  const companies = () => [...document.querySelectorAll("input, select, textarea")].filter((el) => {
    if (!visible(el) || !COMPANY.test(labelOf(el))) return false;
    for (let node = el.parentElement, i = 0; node && node !== document.body && i < 6; node = node.parentElement, i += 1) {
      const labels = [...node.querySelectorAll("input, select, textarea")].filter(visible).map(labelOf);
      if (labels.filter((l) => COMPANY.test(l)).length > 1) return false;
      if (labels.some((l) => /title|role|position|designation/i.test(l)) && labels.some((l) => /start|from|date|year/i.test(l))) return true;
    }
    return false;
  });
  let clicks = 0;
  while (companies().length < wanted && clicks < 12) {
    const list = companies();
    if (!list.length) break;
    // The nearest "Add" button around the last job block, not reaching into the education section.
    let button = null;
    for (let node = list[list.length - 1].parentElement, i = 0; node && node !== document.body && i < 12; node = node.parentElement, i += 1) {
      if ([...node.querySelectorAll("input, select, textarea")].some((el) => EDUCATION.test(labelOf(el)))) break;
      button = [...node.querySelectorAll('button, a, [role="button"]')].filter(visible).find((b) => {
        const text = clean(b.innerText || b.getAttribute("aria-label"));
        return /^\+?\s*add\b/i.test(text) && !/education|school|degree|skill|language|certif|link|website|question/i.test(text);
      });
      if (button) break;
    }
    if (!button) break;
    const before = list.length;
    button.click();
    clicks += 1;
    for (let t = 0; t < 20 && companies().length === before; t += 1) await sleep(150);
    if (companies().length === before) break; // the button didn't add a block
  }
  return { count: companies().length, clicks };
}

/** Attach a file to one tagged upload field (used to re-attach an edited cover letter). */
export function attachFile(fieldId, file) {
  const el = document.querySelector(`[data-riq-id="${CSS.escape(fieldId)}"]`);
  if (!el) return false;
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], file.fileName, { type: file.mimeType || "application/pdf" }));
  el.files = dt.files;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Is there an application form on this page? Counts fillable fields and looks for the usual
 * signs (an email box, a file upload). Cheap: runs on every page the panel looks at.
 */
export function formSignal() {
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const inputs = [...document.querySelectorAll("input, textarea, select")].filter((el) =>
    !["hidden", "submit", "button", "search", "image", "reset", "password"].includes(el.type) && !el.disabled && (visible(el) || el.type === "file"));
  // Button-style dropdowns (Workday's "Select One") are questions too.
  const pickers = [...document.querySelectorAll('button[aria-haspopup="listbox"]')].filter(visible);
  const about = (el) => `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") || ""} ${el.labels?.[0]?.innerText || ""}`;
  const hasEmail = inputs.some((el) => el.type === "email" || /e-?mail/i.test(about(el)));
  const hasFile = inputs.some((el) => el.type === "file");
  const hasName = inputs.some((el) => /name/i.test(about(el)));
  const hasPhone = inputs.some((el) => el.type === "tel" || /phone|mobile/i.test(about(el)));
  const fields = inputs.length + pickers.length;
  // Application steps live under an apply address on most platforms (Workday /apply/…, Lever /apply,
  // Greenhouse job_app); there, any question at all counts – some steps have only an upload.
  const onApplyPath = /\/apply(\/|$)|applyManually|autofillWithResume|job_app|\/application(s)?(\/|$)/i.test(location.pathname + location.search);
  const resumeUpload = hasFile && /resume|\bcv\b|curriculum vitae/i.test(document.body.innerText.slice(0, 20000));
  const isApplication = (onApplyPath && fields >= 1) || resumeUpload || (fields >= 3 && (hasEmail || hasFile || hasName || hasPhone));
  // Identifies the step on multi-page forms: the current step, else the page heading.
  const step = document.querySelector('[aria-current="step"], [data-automation-id="progressBarActiveStep"]')?.innerText ||
    [...document.querySelectorAll("h1, h2")].find(visible)?.innerText || "";
  return { fields, isApplication, step: `${location.pathname}|${step.replace(/\s+/g, " ").trim().slice(0, 80)}` };
}
