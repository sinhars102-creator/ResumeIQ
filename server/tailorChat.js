/**
 * Tailor chat (prototype, /app/tailor): suggestions for one resume against one job description, each
 * tied to an exact line of the resume so the page can mark it, and free-text chat that returns edits
 * in the same shape.
 *
 * Every line the model may touch has an id:
 *   T title · S summary · E{i} a role (for adding a bullet) · E{i}B{j} a bullet · K the skills list
 * Edits: { target, op: "replace" | "add_bullet" | "remove" | "add_skills", after?, skills? }
 *
 * Honesty rule, enforced here as well as in the prompt: a number the resume (or the user's own message)
 * doesn't contain is never written into the resume – it becomes a "[number]" blank for the user to fill.
 */
import { callLLM as callLLMRaw } from "./llm.js";

// A hung provider request shouldn't freeze the chat: give up after 40 seconds (the page offers a retry).
const LLM_TIMEOUT_MS = 40_000;
function callLLM(args) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("The AI took too long to answer. Please try again.")), LLM_TIMEOUT_MS);
  });
  return Promise.race([callLLMRaw(args), timeout]).finally(() => clearTimeout(timer));
}
import { tokenizeForMatch, buildResumeCorpus } from "../src/matchScore.js";
import { textAt, scoreImpact, isExtraTarget, isSectionTarget, extraSlot } from "../src/tailorEdits.js";
import { extraLines, extraSections, educationLine, educationDetails, sectionPlan } from "../src/resumeSections.js";
import { reviewResume, WEAK_START, contactParts, normalizeContactField, setContactField } from "../src/resumeReview.js";

// A suggestion that lowers the job match by more than this (it drops the job's keywords) is left out.
const MAX_SCORE_LOSS = 2;

// Rough stem, so "integrations"/"integrated"/"integrating" count as the same claim.
const stem = (w) =>
  w
    .replace(/[^a-z0-9+#]/g, "")
    .replace(/(ations|ation|ings|ing|ers|ed|es|s)$/, "")
    .replace(/([b-df-hj-np-tv-z])\1$/, "$1"); // cutting -> cutt -> cut
const stems = (text) => new Set(tokenizeForMatch(text).map(stem).filter((w) => w.length >= 3));
// Ordinary resume wording a rewrite may use freely, even when the job description also says it.
const GENERIC = stems(`led lead managed manage owned own drove drive built build shipped ship launched launch delivered deliver
  improved improve increased increase reduced reduce grew grow scaled scale created create designed design developed develop
  defined define tracked track analysed analyzed analyze used using worked collaborated partnered aligned align coordinated
  executed execute supported support helped help ran run prioritised prioritized prioritize translated translate wrote write
  product products feature features customer customers user users business company companies cross-functional functional
  data driven decisions decision adoption growth impact results outcomes quality process processes requirements roadmap
  strategy planning plan stakeholders stakeholder end-to-end experience skilled strong excellent proven track record
  turned turn converted made make set setup established introduced streamlined simplified clarified enabled ensured gathered
  identified researched tested validated measured monitored reviewed presented communicated documented maintained organised
  organized facilitated mentored coached trained hired onboarded negotiated resolved handled achieved reached completed
  every each per daily weekly monthly quarterly annual annually two three four five several multiple first key core main
  major new existing internal external within through via based throughout ongoing regular consistent clear faster better
  higher lower more less over under team teams people member members part whole across time times week weeks month months
  contributed contribute contributing co-wrote cowrote co-authored drafted authored lifted lift boosted boost cut saved save
  partnered partner collaborated collaborate facilitated led spearheaded accelerated expanded grew growing increasing reducing
  per quarter quarterly year yearly percent average total overall from into while resulting result results`);

/**
 * Job-description terms a rewrite introduces that the candidate never claimed (not in the resume, not
 * said in the chat). Writing them in would be inventing experience.
 */
// Words that name a skill, tool, method or domain. A job word the candidate hasn't claimed is only worth stopping a
// rewrite for when it is one of these (or is written as a name in the job description); ordinary words the job also
// happens to use ("powered", "optimal", "engineers", "100+") are not claims. Not a full list: it only decides which
// unclaimed job words count as claims, and the strict check (no job description) never uses it.
const SKILL_WORDS = stems(`sql python java javascript typescript react angular node golang kotlin swift scala ruby php rust
  aws azure gcp kubernetes docker terraform jenkins git linux unix spark hadoop kafka airflow dbt snowflake redshift bigquery
  databricks tableau powerbi looker excel vba sap oracle salesforce hubspot jira confluence figma sketch agile scrum kanban
  sigma kaizen lean waterfall devops cicd microservices api rest graphql etl elt dashboard dashboards analytics forecasting
  forecast clustering regression classification segmentation optimization optimisation simulation modeling modelling statistics
  statistical bayesian econometrics experimentation ab testing automation rpa nlp llm genai ml ai tensorflow pytorch sklearn
  pandas numpy mlops kpi okr roadmap pnl gtm seo sem crm erp wms tms mrp logistics procurement sourcing inventory warehousing
  fulfilment fulfillment transportation routing pricing compliance gdpr hipaa sox audit budgeting forecasting accounting ifrs
  gaap treasury hris recruiting payroll cybersecurity encryption iam sso oauth blockchain iot embedded fpga cad solidworks
  autocad matlab simulink hvac lims gmp haccp iso itil pmp prince2 cfa cpa mba`);

// One- and two-letter skills (Go, R, C#, K8s, AI, ML) vanish from stems(), so they are checked as whole tokens.
// "Go", "R" and "C" are also ordinary letters/words, so only the capitalised form counts as a skill.
const SHORT_SKILL_SET = new Set(["c#", "c++", "f#", "ai", "ml", "k8s", "s3", "bi"]);
const CAPS_ONLY = new Set(["ai", "ml", "bi"]); // "ml" is millilitres, "bi" a prefix: only AI, ML, BI count
const NOT_A_SKILL_AFTER_GO = /^(beyond|to|above|live|further|ahead|back|out|for|the|through|on|with|after|before|and then)\b/i;
export function shortSkillsIn(text) {
  const src = String(text || "");
  const out = new Set();
  for (const m of src.matchAll(/(?<![A-Za-z0-9+#\/&.-])([A-Za-z][A-Za-z0-9+#]{0,2})(?![A-Za-z0-9+#\/&-])/g)) {
    const t = m[1];
    const low = t.toLowerCase();
    if (t === "Go") {
      // "Go beyond", "Go to market" are ordinary words; "Go and Python", "Go, SQL" are the language.
      if (NOT_A_SKILL_AFTER_GO.test(src.slice(m.index + 2).trimStart())) continue;
      out.add("go");
    } else if (t === "R" || t === "C") out.add(low);
    else if (SHORT_SKILL_SET.has(low) && (!CAPS_ONLY.has(low) || t === t.toUpperCase())) out.add(low);
  }
  return out;
}
// Seniority words a candidate must have earned: a title or summary may not gain one the resume never shows.
// Only unambiguous words are checked everywhere. "lead", "head" and "staff" are also ordinary words ("lead generation",
// "staff scheduling", "can lead teams"), so they count only as a title prefix before a role noun ("Lead Product Manager").
const SENIORITY = /\b(senior|sr|principal|director|vp|vice president|chief)\b/gi;
const TITLE_PREFIX = /\b(lead|head|staff)\s+(of\s+)?(product|program|project|software|data|ml|design|engineer|engineering|manager|analyst|developer|designer|pm|architect)\b/gi;
const seniorityIn = (text, { title = false } = {}) => {
  const found = new Set([...String(text || "").matchAll(SENIORITY)].map((m) => m[1].toLowerCase()));
  if (title) for (const m of String(text || "").matchAll(TITLE_PREFIX)) found.add(m[1].toLowerCase());
  return found;
};
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Is this unclaimed job word a skill-type claim (see SKILL_WORDS)? */
function skillLike(word, jdText) {
  const w = String(word || "");
  if (!w || /^\d+[+%]?$/.test(w)) return false; // figures are checked as numbers, not as skills
  if (/[0-9+#/.]/.test(w)) return true; // c++, c#, ci/cd, node.js, s3
  if (SKILL_WORDS.has(stem(w))) return true;
  // Written as a name in the job description: an acronym (SAP, AWS) or capitalised in the middle of a sentence (Kafka).
  for (const m of String(jdText || "").matchAll(new RegExp(`\\b${esc(w)}\\b`, "gi"))) {
    const found = m[0];
    if (found.length >= 2 && found === found.toUpperCase() && /[A-Z]/.test(found)) return true;
    const before = String(jdText).slice(0, m.index).trimEnd();
    const atSentenceStart = !before || /[.!?:\n•·\-–—*]$/.test(before);
    // Plurals and ordinary word forms ("Engineers", "Leading", "Partners") are capitalised by habit, not names.
    if (/^[A-Z]/.test(found) && !atSentenceStart && !/(s|ing|ed|ly|tion)$/i.test(w)) return true;
  }
  return false;
}

export function unsupportedClaims(text, ctx, { strict = false } = {}) {
  // strict (a brand-new bullet): every meaningful word must come from the resume or the candidate;
  // otherwise (rewording an existing line): only the job's own terms are checked.
  // The [number] blank is ours, not a claim. Returns the words as written (not their stems), for questions.
  const clean = String(text).replace(/\[number\]/g, " ");
  const bad = new Set([...stems(clean)].filter((w) => (strict || ctx.strict || ctx.jd.has(w)) && !ctx.supported.has(w) && !GENERIC.has(w)));
  const words = tokenizeForMatch(clean).filter((w) => bad.has(stem(w)));
  const wordsOut = [...new Set(words.map((w) => w.replace(/[^a-z0-9+#/-]/g, "")))].filter(Boolean);
  // Rewording with a job description: only skill-type job words are claims (strict mode keeps every new word).
  const longOut = strict || ctx.strict ? wordsOut : wordsOut.filter((w) => skillLike(w, ctx.jdText));
  const shortOut = [...shortSkillsIn(clean)].filter((t) => !ctx.shortHave.has(t) && (strict || ctx.strict || ctx.shortJd.has(t)));
  return [...new Set([...longOut, ...shortOut])];
}

/** What the candidate has claimed (resume + their own chat messages) and what the job asks for. */
export function claimContext(resume, jd, userText = "", { strict = false } = {}) {
  const extrasText = extraSections(resume).flatMap((x) => x.items.flatMap((i) => (typeof i === "string" ? [i] : [i.heading, ...i.bullets]))).join("\n");
  const corpus = `${buildResumeCorpus(resume)}\n${extrasText}\n${resume?.contact || ""}\n${(resume?.education || []).map((e) => [e.degree, e.school].join(" ")).join("\n")}\n${userText}`;
  return {
    known: numbersIn(`${resumeLines(resume)}\n${userText}`),
    supported: stems(corpus),
    jd: stems(jd || ""),
    jdText: jd || "",
    shortHave: shortSkillsIn(corpus),
    shortJd: shortSkillsIn(jd || ""),
    corpusLower: corpus.toLowerCase(),
    seniorityHave: seniorityIn(corpus, { title: true }),
    // No job description (improving the resume on its own): every new word must come from the candidate.
    strict,
  };
}

const MAX_SUGGESTIONS = 10;

/** At most one suggestion per resume line (must-fixes win); suggestions without a line are kept. */
function onePerLine(list) {
  const seen = new Set();
  return [...list]
    .sort((a, b) => (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1))
    .filter((x) => {
      const line = x.edit?.target || x.target;
      if (!line) return true;
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
}


/**
 * The resume as numbered lines, for the prompt. Built from the same section list as the screen and the PDF
 * (extraLines), so a section the candidate can see is a section the AI can read and edit. It also names the sections
 * the resume does NOT have, so the AI can say so truthfully instead of guessing.
 */
export function resumeLines(resume) {
  const lines = [];
  if (resume?.name) lines.push(`(name) ${resume.name}`);
  if (resume?.contact) lines.push(`[C] ${resume.contact}`);
  if (resume?.title) lines.push(`[T] ${resume.title}`);
  if (resume?.summary) lines.push(`[S] ${resume.summary}`);
  (resume?.experience || []).forEach((role, i) => {
    if (!role || role.removed) return;
    lines.push(`[E${i}] ${[role.role, role.company, role.period].filter(Boolean).join(" · ")}`);
    (role.bullets || []).forEach((b, j) => b != null && lines.push(`  [E${i}B${j}] ${b}`));
  });
  lines.push("## Education [D]");
  (resume?.education || []).forEach((e, i) => !e?.removed && lines.push(`  [D${i}] ${[educationLine(e), ...educationDetails(e)].filter(Boolean).join(" · ")}`));
  if (resume?.skills?.length) lines.push(`[K] Skills: ${resume.skills.join(", ")}`);
  if (resume?.certifications?.length) lines.push(`[Z] Certifications: ${resume.certifications.join(", ")}`);
  const extras = extraLines(resume);
  extras.forEach((sec) => {
    lines.push(`## ${sec.title}${sec.readOnly ? " (read only)" : sec.kind === "entries" ? "" : ` [X:${sec.key}]`}`);
    if (sec.kind === "entries") {
      sec.items.forEach((e) => {
        lines.push(`[${e.id}] ${[e.heading, e.meta].filter(Boolean).join(" · ")}`);
        e.bullets.forEach((b) => lines.push(`  [${b.id}] ${b.text}`));
      });
    } else sec.items.forEach((x) => lines.push(x.id ? `  [${x.id}] ${x.text}` : `  ${x.text}`));
  });
  const has = sectionPlan(resume).map((x) => x.title);
  const missing = ["Summary", "Experience", "Education", "Skills", "Certifications", "Projects", "Volunteering", "Achievements", "Publications", "Languages", "Interests"].filter((n) => !has.includes(n));
  const plan = sectionPlan(resume);
  lines.push(`SECTIONS ON THIS RESUME, top to bottom: ${plan.map((x) => `${x.title} [SEC:${x.key}]`).join(", ") || "none"}. NOT ON THIS RESUME: ${missing.join(", ")}.`);
  return lines.join("\n");
}

const numbersIn = (text) => new Set((String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", "")));

/** Replace numbers the resume and the user never gave with a [number] blank. */
function withoutInventedNumbers(after, known) {
  let blanks = 0;
  const text = String(after || "").replace(/(?:₹|\$|Rs\.?\s?)?\d+(?:[.,]\d+)?\s?(?:%|\+|x|k|K|M|L|lakh|crore|cr)?/g, (match) => {
    const digits = (match.match(/\d+(?:[.,]\d+)?/) || [""])[0].replace(",", "");
    if (known.has(digits)) return match;
    blanks++;
    return "[number]";
  });
  return { text, blanks };
}

/**
 * Keep only well-formed edits on lines that exist; strip invented numbers. An edit that brings in job
 * terms the candidate never claimed comes back as { unsupported: [...] } so the caller asks instead.
 */
/** Same words once look-alike characters, case and punctuation are ignored (letters of any script count). */
export const plainText = (t) => String(t || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const samePlain = (a, b) => plainText(a) === plainText(b);

/** Whole-section edits: remove it, move it, rename it. These change layout, not facts, so nothing is claimed. */
function cleanSectionEdit(edit, resume) {
  const { target, op } = edit;
  const key = target.slice(4);
  const plan = sectionPlan(resume);
  const at = plan.findIndex((x) => x.key === key);
  if (at < 0 || plan[at].readOnly) return null;
  if (op === "remove_section") return { target, op };
  if (op === "move_section") {
    const to = Number.isFinite(+edit.to) ? Math.max(0, Math.min(plan.length - 1, Math.round(+edit.to))) : null;
    return to == null || to === at ? null : { target, op, to };
  }
  if (op === "rename_section") {
    const after = String(edit.after || "").trim().slice(0, 60);
    return after && plainText(after) !== plainText(plan[at].title) ? { target, op, after } : null;
  }
  return null;
}

const EDU_FIELDS = ["degree", "school", "year", "grade", "location"];
/**
 * Education: add_education {target:"D", entry:{degree, school, year?, grade?, location?}} or update_education
 * {target:"D0", entry:{...fields to change}}. Education is a fact only the candidate can state, so every word must come
 * from the resume or from what the candidate said in this chat; nothing is invented, and optional details can be left out.
 */
function cleanEducationEdit(edit, resume, ctx) {
  const { target, op } = edit;
  if ((op === "add_education") !== (target === "D")) return null;
  const raw = edit.entry && typeof edit.entry === "object" ? edit.entry : {};
  const entry = {};
  for (const f of EDU_FIELDS) if (raw[f] != null && String(raw[f]).trim()) entry[f] = String(raw[f]).trim().slice(0, 120);
  if (op === "add_education" && !entry.degree && !entry.school) return null;
  if (!Object.keys(entry).length) return null;
  const current = op === "update_education" ? resume.education?.[+target.slice(1)] : null;
  if (op === "update_education" && !current) return null;
  // Nothing new: every field already says this.
  if (current && Object.entries(entry).every(([f, v]) => plainText(current[f]) === plainText(v))) return null;
  if (op === "add_education" && (resume.education || []).some((e) => plainText(e.degree) === plainText(entry.degree) && plainText(e.school) === plainText(entry.school))) return null;
  const text = Object.values(entry).join(" ");
  const unsupported = unsupportedClaims(text, ctx, { strict: true });
  if (unsupported.length) return { unsupported };
  // A year or grade the candidate never gave is invented, so it's treated like any other unclaimed fact.
  if (withoutInventedNumbers(text, ctx.known).text !== text) return { unsupported: [entry.year || entry.grade || "that number"] };
  return { target, op, entry, after: [entry.degree, entry.school, entry.year].filter(Boolean).join(" · ") };
}

/** Edits on the extra sections (see extraLines): replace / remove an item, add_item to a list, set_items (remove or reorder only). */
function cleanExtraEdit(edit, resume, ctx) {
  const { target, op } = edit;
  const slot = extraSlot(resume, target);
  if (!slot) return null;
  const isItem = slot.index != null;
  if (op === "remove_section") {
    const key = target.split(":")[1];
    const sec = extraLines(resume).find((x) => x.key === key);
    return !isItem && sec && !sec.readOnly ? { target, op } : null; // references are read only
  }
  if (slot.whole) return null; // the entry list itself only takes remove_section
  if (op === "remove") return isItem ? { target, op } : null;
  if (op === "set_items") {
    if (isItem) return null;
    const have = new Set(slot.list.filter((x) => x != null).map((x) => plainText(x)));
    const items = (Array.isArray(edit.items) ? edit.items : []).map((x) => String(x).trim()).filter(Boolean);
    // Only removes or reorders: every item must already be in the list, and nothing may be repeated.
    const seen = new Set(items.map(plainText));
    return items.length && seen.size === items.length && items.every((x) => have.has(plainText(x))) ? { target, op, items } : null;
  }
  if ((op === "replace" && !isItem) || (op === "add_item" && isItem)) return null;
  if (op !== "replace" && op !== "add_item") return null;
  const after = String(edit.after || "").trim().slice(0, 600);
  if (!after || (op === "replace" && samePlain(after, textAt(resume, target)))) return null;
  const unsupported = unsupportedClaims(after, ctx, { strict: op === "add_item" });
  if (unsupported.length) return { unsupported };
  const { text } = withoutInventedNumbers(after, ctx.known);
  return { target, op, after: text, blanks: (text.match(/\[number\]/g) || []).length };
}

export function cleanEdit(edit, resume, ctx) {
  if (!edit || typeof edit !== "object") return null;
  const { target, op } = edit;
  if (!["replace", "add_bullet", "remove", "add_skills", "set_skills", "add_certifications", "add_item", "set_items", "add_education", "update_education", "remove_section", "move_section", "rename_section", "set_certifications"].includes(op)) return null;
  if (textAt(resume, target) == null) return null;
  if (isSectionTarget(target)) return cleanSectionEdit(edit, resume);
  if (isExtraTarget(target)) return cleanExtraEdit(edit, resume, ctx);
  if (op === "add_education" || op === "update_education") return cleanEducationEdit(edit, resume, ctx);
  if (["add_item", "set_items", "remove_section", "move_section", "rename_section"].includes(op)) return null;
  // A whole role or education entry can be dropped; education is otherwise changed only by add_education / update_education.
  if (op === "remove" && /^(E\d+|D\d+)$/.test(target)) return { target, op };
  if (target === "D" || /^D\d+$/.test(target)) return null;
  if (op === "set_certifications") {
    // Remove or reorder only: every certification must already be on the list.
    const have = new Set((resume.certifications || []).map((x) => plainText(x)));
    const items = (Array.isArray(edit.items) ? edit.items : []).map((x) => String(x).trim()).filter(Boolean);
    const seen = new Set(items.map(plainText));
    return target === "Z" && items.length && seen.size === items.length && items.every((x) => have.has(plainText(x))) ? { target, op, items } : null;
  }
  if (op === "set_skills") {
    // Remove or reorder only: every skill must already be on the list.
    const have = new Set((resume.skills || []).map((x) => String(x).toLowerCase()));
    const skills = (Array.isArray(edit.skills) ? edit.skills : []).map((x) => String(x).trim()).filter(Boolean);
    return target === "K" && skills.length && skills.every((x) => have.has(x.toLowerCase())) ? { target, op, skills } : null;
  }
  if (op === "add_certifications") {
    const have = new Set((resume.certifications || []).map((x) => String(x).toLowerCase()));
    const items = (Array.isArray(edit.items) ? edit.items : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 120 && !have.has(x.toLowerCase()));
    const said = items.filter((x) => [...stems(x)].every((w) => ctx.supported.has(w) || GENERIC.has(w)));
    if (target !== "Z") return null;
    if (said.length) return { target, op, items: said.slice(0, 8) };
    return items.length ? { unsupported: items.slice(0, 3) } : null;
  }
  if (op === "add_skills") {
    if (target !== "K") return null;
    const have = new Set((resume.skills || []).map((s) => s.toLowerCase()));
    const wanted = (Array.isArray(edit.skills) ? edit.skills : []).map((s) => String(s).trim()).filter((s) => s && s.length <= 40 && !have.has(s.toLowerCase()));
    // A skill goes in only when the resume or the chat already shows it.
    // Whole-token check: a skill with no stems (Go, R, C#, K8s) is never "shown" just because nothing was compared.
    const shown = wanted.filter((s) => {
      const st = [...stems(s)];
      const sh = [...shortSkillsIn(s)];
      if (!st.length && !sh.length) return new RegExp(`(?<![a-z0-9+#])${esc(s.toLowerCase())}(?![a-z0-9+#])`).test(ctx.corpusLower);
      return st.every((w) => ctx.supported.has(w)) && sh.every((t) => ctx.shortHave.has(t));
    });
    const unshown = wanted.filter((s) => !shown.includes(s));
    if (shown.length) return { target, op, skills: shown.slice(0, 8) };
    return unshown.length ? { unsupported: unshown.slice(0, 4) } : null;
  }
  if (op === "remove") return /^E\d+B\d+$/.test(target) ? { target, op } : null;
  if (op === "add_bullet" && !/^E\d+$/.test(target)) return null;
  if (op === "replace" && !/^(C|T|S|E\d+B\d+)$/.test(target)) return null;
  const after = String(edit.after || "").trim().slice(0, 600);
  // Same words, at most a full stop or capital letter different: not worth a suggestion.
  if (!after || samePlain(after, textAt(resume, target))) return null;
  // The contact line only holds the candidate's own details (city, links), so it isn't checked for invented
  // claims – numbers still are (a phone number must come from them).
  const unsupported = target === "C" ? [] : unsupportedClaims(after, ctx, { strict: op === "add_bullet" });
  // A new title or summary may not claim seniority ("Senior", "Lead", "Head") the resume or the candidate never showed.
  if (target === "T" || target === "S") {
    const inflated = [...seniorityIn(after, { title: target === "T" })].filter((w) => !ctx.seniorityHave.has(w));
    if (inflated.length) unsupported.push(...inflated);
  }
  if (unsupported.length) return { unsupported };
  let { text } = withoutInventedNumbers(after, ctx.known);
  if (target === "C") {
    // Same clean-up as a typed answer: the city's spelling corrected, city only; parts in a standard order.
    const parts = contactParts(text);
    const city = parts.location ? normalizeContactField("location", parts.location) : "";
    text = setContactField(text, "location", city);
  }
  return { target, op, after: text, blanks: (text.match(/\[number\]/g) || []).length };
}

/** Words that show up as "unclaimed" in a new line but aren't anything the candidate could have done or not done. */
const NOT_A_CLAIM = /^(?:score|scores|scoring|using|used|use|based|including|ensure\w*|provid\w*|support\w*|strong|ability|ideal|experience|experienced|work|working|worked|help\w*|implement\w*|build\w*|improv\w*|driv\w*|deliver\w*|manag\w*|lead\w*|develop\w*|creat\w*|design\w*|team|teams|role|roles|responsib\w*|key|new|high|large|scale|across|within|ownership|own|owned)$/i;

/** The job's own wording for each term (its first phrase in the job description containing it). */
function jobWording(terms, jd) {
  return terms.map((t) => {
    const m = new RegExp(`\\b[\\w/-]*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\w/-]*\\b`, "i").exec(jd || "");
    return m ? m[0] : t;
  });
}

/** The terms worth asking about: real skills or tools, not filler words from the new line. */
export function askableTerms(terms, jd) {
  const kept = [...new Set(terms)].filter((t) => skillLike(t, jd) || !NOT_A_CLAIM.test(t));
  const skills = kept.filter((t) => skillLike(t, jd));
  return (skills.length ? skills : kept.filter((t) => !NOT_A_CLAIM.test(t) && !/^(?:\w+ing|\w+ed)$/i.test(t))).slice(0, 3);
}

const listOf = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] || "");

/** One line that says what was left out and why, in the candidate's terms. */
export function heldBackLine(terms, jd) {
  const shown = jobWording(askableTerms(terms, jd), jd);
  if (!shown.length) return "I left that out: it adds something you haven't told me.";
  return `I didn't add ${listOf(shown.map((t) => `"${t}"`))}: you haven't said you've done ${shown.length > 1 ? "those" : "that"}.`;
}

/** "The job asks for merchant onboarding and UPI. Have you done either? Tell me where." for an edit that would invent it. */
export function askAbout(terms, jd) {
  const shown = jobWording(askableTerms(terms, jd), jd);
  if (!shown.length) return "That line needs something you haven't told me yet. What did you actually do there? Tell me, and I'll write it.";
  const both = shown.length > 1;
  if (!jd) return `I'd need to mention ${listOf(shown)}, which isn't on your resume yet. Have you done ${both ? "either" : "this"}? Tell me where, and I'll add it.`;
  return `The job asks for ${listOf(shown)}. Have you done ${both ? "either" : "this"}? Tell me where, and I'll add it.`;
}

function parseJson(text) {
  const cleaned = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start >= 0 ? cleaned.slice(start, end + 1) : cleaned);
}

const RULES = `Rules:
- Never invent experience, employers, tools, certifications or numbers. If the job asks for something the resume does not show, ask the candidate a question instead of writing it in.
- If a stronger bullet needs a metric you don't have, write "[number]" where it goes (e.g. "cut onboarding time by [number]%").
- Keep the candidate's facts; change wording, order of emphasis, and the job's own terms where the resume already supports them.
- A rewritten line may only mention teams, tools, domains and results that the same line (or the candidate in this chat) already states. To add something new, ask a question instead.
- Never change job titles or seniority (no "Senior", "Lead" or "Head" the resume doesn't already use for that person).
- Keep the candidate's level of ownership: "helped", "assisted" or "supported" may become "contributed to" or "partnered on", never "led", "owned" or "launched".
- Bullets: one line, start with a strong verb, at most about 25 words.
- Refer to resume lines only by their ids in square brackets (T, S, E0, E0B1, K, X:other0:2).
- Every section listed under SECTIONS ON THIS RESUME is real and editable (except those marked read only): Core Competencies, projects, achievements, languages and so on. Never say a listed section is missing, and never edit a different section to stand in for the one the candidate named. If they ask about a section under NOT ON THIS RESUME, say so plainly. If they ask for something no edit can do, say that instead of doing something else.
- Never say you removed, added, changed or trimmed something unless that exact change is in your edits. If you can't do it, say so.
- When the candidate tells you a fact (a degree, a school, a tool), write it in now with what they gave you. Don't ask for optional details such as the year or grade; add them later if they offer.
- When the candidate corrects you ("no, I meant ..."), the section they name wins: change that section, or say you can't.`;

const EDIT_SHAPE = `An edit is one of:
{"target":"S","op":"replace","after":"new text"}            (T, S or a bullet id like E0B1)
{"target":"E0","op":"add_bullet","after":"new bullet"}      (adds a bullet to role E0)
{"target":"E1B3","op":"remove"}                              (drops a weak or irrelevant bullet)
{"target":"K","op":"add_skills","skills":["SQL","Tableau"]} (only skills the resume already shows evidence of)
{"target":"K","op":"set_skills","skills":["SQL","Jira"]}     (the whole skills list, only removing or reordering)
{"target":"C","op":"replace","after":"email · phone · city · linkedin.com/in/…"} (the contact line)
{"target":"Z","op":"add_certifications","items":["PMP (2023)"]} (only certifications the candidate has stated)
{"target":"D","op":"add_education","entry":{"degree":"MBA","school":"IIM Ahmedabad","year":"2021"}} (adds an education entry: only what the candidate has stated; year, grade and location are optional)
{"target":"D0","op":"update_education","entry":{"year":"2016"}}  (changes fields of education entry D0)
{"target":"X:other0:2","op":"replace","after":"new text"}     (an item in an extra section: Core Competencies, achievements, languages, a project bullet like X:projects:0:1)
{"target":"X:other0:4","op":"remove"}                        (drops an item from an extra section)
{"target":"X:other0","op":"set_items","items":["Item A","Item B"]} (the whole list of an extra section, only removing or reordering: use it to trim or shorten a list)
{"target":"SEC:other0","op":"remove_section"}                (deletes a whole section of any kind: SEC:summary, SEC:experience, SEC:education, SEC:skills, SEC:certifications, SEC:projects, SEC:other0 ...)
{"target":"SEC:skills","op":"move_section","to":0}           (moves a section; "to" is its new position, 0 = top, counted over the sections in SECTIONS ON THIS RESUME)
{"target":"SEC:other0","op":"rename_section","after":"Strengths"} (renames a section heading)
{"target":"E2","op":"remove"}                                (drops a whole role with its bullets) · {"target":"D0","op":"remove"} (drops an education entry)
{"target":"Z","op":"set_certifications","items":["PMP"]}     (the whole certifications list, only removing or reordering)
{"target":"X:achievements","op":"add_item","after":"new item"} (adds an item to a list section; for a project use X:projects:0)`;

/** Suggestions for the resume against a job description. */
export async function suggestForJob({ resume, jd }) {
  const system = "You are a senior recruiter helping a candidate tailor their resume to one job. Return ONLY JSON.";
  const user = `JOB DESCRIPTION:
${jd.slice(0, 12000)}

RESUME (line ids in brackets):
${resumeLines(resume)}

${RULES}

${EDIT_SHAPE}

Return JSON:
{
  "jobTitle": "the job's title",
  "company": "the company, or empty",
  "intro": "one or two sentences: how well this resume fits the job and the biggest thing to fix",
  "suggestions": [
    {
      "priority": "must" | "nice",
      "title": "short label, e.g. 'Lead with stakeholder management'",
      "why": "one sentence tied to a specific requirement in the job description",
      "edit": <an edit, or null when you need to ask first>,
      "question": "a question for the candidate when the job needs something the resume doesn't show (else null)",
      "target": "for a question: the id of the line it is about (e.g. S or E0B2), or null"
    }
  ]
}
Give 4 to ${MAX_SUGGESTIONS} suggestions, most important first, "must" for gaps that would get the resume rejected.`;
  const raw = await callLLM({ system, user, maxTokens: 3500, json: true, task: "write" });
  const data = parseJson(raw);
  const ctx = claimContext(resume, jd);
  const job = { title: String(data.jobTitle || ""), jd };
  const raws = Array.isArray(data.suggestions) ? data.suggestions : [];
  const cleanedEdits = await cleanAll(raws.map((s) => (s?.edit && typeof s.edit === "object" ? s.edit : null)), resume, ctx);
  const suggestions = raws
    .map((s, i) => {
      const cleaned = cleanedEdits[i];
      const edit = cleaned && !cleaned.unsupported ? cleaned : null;
      let question = typeof s?.question === "string" && s.question.trim() ? humanizeIds(s.question.trim().slice(0, 300), resume) : null;
      if (cleaned?.unsupported) question = askAbout(cleaned.unsupported, jd);
      if (!edit && !question) return null;
      const impact = edit ? scoreImpact(resume, edit, job) : 0;
      if (impact < -MAX_SCORE_LOSS) return null;
      // A question still points at the line it's about, so the resume can mark it.
      const target = edit?.target || [s.edit?.target, s.target].find((t) => typeof t === "string" && textAt(resume, t) != null) || null;
      return {
        id: `s${i + 1}`,
        priority: s.priority === "must" ? "must" : "nice",
        // A rewritten edit dropped terms the model's own title and reason may still mention.
        title: edit?.rewritten ? neutralTitle(edit) : humanizeIds(String(s.title || "Suggestion").slice(0, 90), resume),
        why: edit?.rewritten ? "Reworded towards this job, without claiming anything you haven't said." : humanizeIds(String(s.why || "").slice(0, 300), resume),
        edit,
        question: edit ? null : question,
        target,
        before: target ? textAt(resume, target) : null,
        impact,
      };
    })
    .filter(Boolean)
    // One card per question and one per line: the model sometimes repeats itself.
    .filter((s, i, all) => !s.question || all.findIndex((o) => o.question === s.question) === i);
  const unique = onePerLine(suggestions).slice(0, MAX_SUGGESTIONS);
  return {
    jobTitle: String(data.jobTitle || "").slice(0, 120),
    company: String(data.company || "").slice(0, 120),
    intro: String(data.intro || "").slice(0, 500),
    suggestions: unique,
  };
}

/**
 * One more try for edits that brought in job terms the candidate never claimed: the model rewrites each
 * without those terms. Returns the cleaned edits in the same order (null, or still { unsupported }, when
 * the rewrite didn't work).
 */
async function rewriteWithoutUnclaimed(blocked, resume, ctx) {
  if (!blocked.length) return [];
  const user = `These resume edits mention things the candidate has NOT claimed. Rewrite each "after" so it no longer mentions the listed terms (or anything else the candidate hasn't said), keeping the rest of its meaning and the candidate's own facts. Return null for an edit that would be pointless without them.

RESUME (line ids in brackets):
${resumeLines(resume)}

EDITS:
${blocked.map((b, i) => `${i + 1}. ${b.edit.target} (${b.edit.op}): "${b.edit.after}" – must not mention: ${b.unsupported.join(", ")}`).join("\n")}

Return JSON: {"edits": ["rewritten text" or null, ...]} – one entry per edit, same order.`;
  try {
    const data = parseJson(await callLLM({ system: "You edit resume lines precisely and never add facts. Return ONLY JSON.", user, maxTokens: 1200, json: true, task: "write" }));
    return blocked.map((b, i) => {
      const after = data.edits?.[i];
      return typeof after === "string" && after.trim() ? cleanEdit({ ...b.edit, after }, resume, ctx) : null;
    });
  } catch (err) {
    console.warn("[tailor] rewrite without unclaimed terms failed:", err.message);
    return blocked.map(() => null);
  }
}

/** Wording that says a change was made (used to catch a reply that claims one when no change was produced). */
export const CLAIMS_A_CHANGE = /\b(removed|deleted|dropped|trimmed|shortened|added|updated|changed|rewrote|rewritten|reworded|restored|replaced|reordered|cut)\b/i;

const neutralTitle = (edit) =>
  ({ C: "Tidy your contact line", T: "Sharpen your headline", S: "Sharpen your summary", K: "Add skills", Z: "Add certifications" })[edit.target] || (edit.op === "add_bullet" ? "Add a bullet" : edit.op === "add_education" ? "Add to your education" : edit.op === "update_education" ? "Update your education" : edit.op === "move_section" ? "Move this section" : edit.op === "rename_section" ? "Rename this section" : edit.op === "set_certifications" ? "Trim your certifications" : edit.op === "remove_section" ? "Remove this section" : edit.op === "set_items" ? "Trim or reorder this list" : edit.op === "add_item" ? "Add an item" : edit.op === "remove" ? "Remove an item" : "Sharpen this bullet");

/** First pass over the model's edits; edits with unclaimed terms get one rewrite before giving up. */
async function cleanAll(rawEdits, resume, ctx) {
  const first = rawEdits.map((e) => (e ? cleanEdit(e, resume, ctx) : null));
  const blocked = first.map((c, i) => (c?.unsupported && rawEdits[i]?.after ? { i, edit: rawEdits[i], unsupported: c.unsupported } : null)).filter(Boolean);
  const retried = await rewriteWithoutUnclaimed(blocked, resume, ctx);
  blocked.forEach((b, k) => {
    if (retried[k] && !retried[k].unsupported) first[b.i] = { ...retried[k], rewritten: true };
  });
  return first;
}

const RESULT_QUESTION = "What changed because of this work? A number helps most – e.g. how many users or customers, % faster, ₹ saved, team size. Tell me and I'll rewrite the line.";

/**
 * "Improve my resume" (no job description): the review's checks, with the model writing the rewrites
 * for flagged lines in one call. Every rewrite passes the strict honesty check (only the candidate's own
 * words, numbers as [number] blanks); one that can't becomes a question instead.
 */
export async function reviewForImprove({ resume, pages = null }) {
  const review = reviewResume(resume, { pages });
  const toRewrite = review.issues.filter((i) => i.fix === "rewrite");
  const ctx = claimContext(resume, "", "", { strict: true });
  let rewrites = {};
  if (toRewrite.length) {
    const user = `Improve these resume lines. Each has a problem to fix.

RESUME (line ids in brackets):
${resumeLines(resume)}

LINES TO FIX:
${toRewrite.map((i, n) => `${n + 1}. [${i.target}] ${i.hint === "summary_missing" ? "there is no summary: write one (2-3 sentences) from the resume's own facts" : String(i.hint).replace("no number or result", "no number or result – end with the outcome this work had, using a [number] blank for the figure (e.g. \"…, cutting release time by [number]%\")")}`).join("\n")}

${RULES}
- Bullets start with a strong verb (past tense for past roles); one line, at most about 25 words.
- Summary: 2-3 sentences, no "I", with years of experience, focus and one strength the resume shows.

Return JSON: {"rewrites": [{"target": "E0B1", "after": "the improved line"}, ...]} – one per line above.`;
    try {
      const data = parseJson(await callLLM({ system: "You are a senior resume writer. You improve wording without adding facts. Return ONLY JSON.", user, maxTokens: 1500, json: true, task: "write" }));
      for (const w of Array.isArray(data.rewrites) ? data.rewrites : []) if (w?.target && typeof w.after === "string") rewrites[w.target] = w.after;
    } catch (err) {
      console.warn("[tailor] review rewrites failed:", err.message);
      rewrites = {};
    }
  }
  const raw = toRewrite.map((i) => (rewrites[i.target] ? { target: i.target, op: "replace", after: rewrites[i.target] } : null));
  const cleaned = await cleanAll(raw, resume, ctx);
  // A rewrite must fix what it was flagged for (a "weak opening" rewrite that still opens weakly isn't one).
  const fixes = (i, e) => {
    const hint = i.hint || "";
    const after = String(e.after || "").trim();
    // "No result" is only fixed by a number (or a blank for one); otherwise we ask for the result.
    if (/no number or result/.test(hint) && !/\d|\[number\]|%|₹|\$/.test(after)) return false;
    if (/weak opening/.test(hint) && WEAK_START.test(after) && !/too long|too vague/.test(hint)) return false;
    return true;
  };
  const edits = new Map(toRewrite.map((i, n) => [i.id, cleaned[n] && !cleaned[n].unsupported && fixes(i, cleaned[n]) ? cleaned[n] : null]));

  const order = [...review.categories].sort((a, b) => a.score - b.score).map((c) => c.id);
  const suggestions = review.issues
    .map((i) => {
      let edit = i.fix === "edit" ? i.edit : i.fix === "rewrite" ? edits.get(i.id) : null;
      let question = i.question || null;
      if (i.fix === "rewrite" && !edit) {
        // No honest rewrite: ask for the missing result instead, or leave a vague-but-true line alone.
        if (!/no number or result|too vague/.test(i.hint || "")) return null;
        question = RESULT_QUESTION;
      }
      // Name the change by what the rewrite actually does.
      let title = i.title;
      if (i.fix === "rewrite" && edit && i.target !== "S") {
        title = edit.blanks ? "Show the result" : /weak opening/.test(i.hint) ? "Start with a strong verb" : /too long/.test(i.hint) ? "Tighten this bullet" : "Sharpen this bullet";
      }
      return {
        id: i.id,
        category: i.category,
        priority: i.priority,
        title,
        why: i.why,
        edit: edit || null,
        question: edit ? null : question,
        action: i.fix === "action" ? i.action : null,
        field: i.field || null,
        target: i.target || null,
        before: i.target ? textAt(resume, i.target) : null,
      };
    })
    .filter((s) => s && (s.edit || s.question || s.action))
    .filter((s, i, all) => onePerLine(all).includes(s))
    .sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (a.priority === "must" ? 0 : 1) - (b.priority === "must" ? 0 : 1));
  return {
    overall: review.overall,
    categories: review.categories.map((c) => ({ id: c.id, label: c.label, score: c.score })),
    suggestions,
  };
}

/**
 * The model refers to resume lines by id ([E0B4], [S]) because the prompt does. People shouldn't see ids: swap each
 * for a plain description of the line it points at.
 */
export function humanizeIds(text, resume) {
  const words = (t, n = 6) => {
    const w = String(t || "").trim().split(/\s+/).filter(Boolean);
    return w.length > n ? `${w.slice(0, n).join(" ")}…` : w.join(" ");
  };
  const describe = (id) => {
    if (id === "S") return "your summary";
    if (id === "T") return "your title";
    if (id === "C") return "your contact line";
    if (id === "K") return "your skills";
    if (id === "Z") return "your certifications";
    if (id === "N") return "your name";
    const bullet = /^E(\d+)B(\d+)$/.exec(id);
    if (bullet) {
      const t = textAt(resume, id);
      return t ? `the bullet “${words(t)}”` : "one of your bullets";
    }
    const role = /^E(\d+)$/.exec(id);
    if (role) {
      const e = resume?.experience?.[+role[1]];
      return e ? `your ${[e.role, e.company].filter(Boolean).join(" at ")} role` : "one of your roles";
    }
    const edu = /^D(\d+)/.exec(id);
    if (edu) {
      const e = resume?.education?.[+edu[1]];
      return e ? `your ${[e.degree, e.school].filter(Boolean).join(", ")} education entry` : "your education";
    }
    return "that line";
  };
  return String(text ?? "")
    .replace(/\[((?:C|T|S|K|Z|N|D\d+(?::\w+)*|D|E\d+(?:B\d+)?|X:[\w:]+))\]/g, (_, id) => describe(id))
    .replace(/\bE\d+B\d+\b/g, (id) => describe(id))
    .replace(/\s{2,}/g, " ");
}

/** One chat turn: a reply, plus edits the candidate can apply. */
export async function chatTurn({ resume, jd, jobTitle = "", history = [], message, answerTo = "" }) {
  // What the candidate has said: their own messages, never the job description they pasted.
  const own = history.filter((m) => m.role === "user" && String(m.text || "").trim() !== String(jd || "").trim()).map((m) => String(m.text || ""));
  const system = "You are a friendly, precise resume coach working inside a chat next to the candidate's resume. Return ONLY JSON.";
  const convo = history
    .slice(-10)
    .map((m) => (m.role === "user" && jd && String(m.text || "").trim() === jd.trim() ? "Candidate: (pasted the job description above)" : `${m.role === "user" ? "Candidate" : "Coach"}: ${String(m.text || "").slice(0, 1200)}`))
    .join("\n");
  const user = `${jd ? `JOB DESCRIPTION:\n${jd.slice(0, 8000)}\n\n` : ""}RESUME (line ids in brackets):
${resumeLines(resume)}

${convo ? `CONVERSATION SO FAR:\n${convo}\n\n` : ""}${answerTo ? `COACH ASKED: ${String(answerTo).slice(0, 400)}\n` : ""}CANDIDATE NOW SAYS: ${message.slice(0, 2000)}

${RULES}
- Facts and numbers the candidate states in this conversation may be used.

${EDIT_SHAPE}

Return JSON: {"reply": "short answer (1-3 sentences)", "edits": [{"title": "short label", "edit": <an edit>}]}
Return an empty "edits" list when no change to the resume is needed.`;
  const raw = await callLLM({ system, user, maxTokens: 2500, json: true, task: "command" });
  const data = parseJson(raw);
  const userText = `${message}\n${own.join("\n")}`;
  const ctx = claimContext(resume, jd, userText, { strict: !jd });
  const asks = [];
  const raws = Array.isArray(data.edits) ? data.edits : [];
  const cleanedEdits = await cleanAll(raws.map((e) => (e?.edit && typeof e.edit === "object" ? e.edit : e && typeof e === "object" ? e : null)), resume, ctx);
  const edits = raws
    .map((e, i) => {
      const edit = cleanedEdits[i];
      if (edit?.unsupported) {
        asks.push(...edit.unsupported);
        return null;
      }
      if (!edit) return null;
      return {
        id: `c${Date.now().toString(36)}${i}`,
        priority: "nice",
        title: edit.rewritten ? neutralTitle(edit) : String(e?.title || "Suggested change").slice(0, 90),
        why: "",
        edit,
        question: null,
        target: edit.target,
        before: textAt(resume, edit.target),
        impact: jd ? scoreImpact(resume, edit, { title: jobTitle, jd }) : 0,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  let reply = String(data.reply || "").slice(0, 800) || (edits.length ? "Here's the change – tap Apply to use it." : "");
  // The model's reply describes its own edits; when every one was blocked, it would claim a change that didn't happen.
  const heldTerms = [...new Set(asks)];
  if (asks.length && !edits.length) reply = heldBackLine(heldTerms, jd);
  if (asks.length) reply = `${reply}${reply ? " " : ""}${askAbout(heldTerms, jd)}`.trim();
  // A reply may only claim a change that is actually in the list: no change card means nothing was changed.
  if (!edits.length && !asks.length && CLAIMS_A_CHANGE.test(reply)) {
    reply = "I couldn't turn that into a change on your resume, so nothing has been changed. Tell me which section and what to do, for example \"remove the core competencies section\", and I'll suggest it.";
  }
  edits.forEach((e) => {
    e.title = humanizeIds(e.title, resume);
    e.why = humanizeIds(e.why, resume);
  });
  return { reply: humanizeIds(reply, resume) || "Got it.", suggestions: edits };
}
