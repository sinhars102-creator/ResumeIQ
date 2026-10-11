/**
 * Easy Apply autofill: answer an application form (server/easyApply.js field shape) from the
 * applicant's profile and resume, for the applicant to review. Nothing is submitted.
 *
 * Order: fixed rules from the profile first (name, email, phone, work authorisation…), then
 * the AI for the remaining questions, answering only from the resume and profile. Two kinds
 * of field are never filled automatically: voluntary diversity questions (the applicant's own
 * choice) and acknowledgements/attestations (their own legal consent).
 *
 * Each answer: { value, source: "profile" | "saved" | "resume" | "ai", confidence: "high" | "check" }
 * ("check" = the applicant should look closely: every AI answer, and inferred yes/no answers).
 * Fields left out of `answers` are listed in `needsYou` with the reason.
 */
import { callLLM } from "./llm.js";

const DIVERSITY = /\b(gender|race|ethnic|veteran|disabilit|sexual orientation|pronoun|hispanic|latino|equal (employment )?opportunity|eeo)\b/i;
const ACKNOWLEDGE = /\b(privacy (policy|notice)|attest\w*|acknowledg\w*|consent\w*|agreement|arbitrat\w*|waiver|i (have read|agree|certify|confirm)|terms (and|&) conditions|terms of (use|service)|declaration|signature|(confirm|certify|declare)[^?]{0,80}(accurate|true|complete|correct))\b/i;
// An answer that commits the applicant ("I understand and agree…", "I acknowledge…") is theirs to give.
const AGREEING_OPTION = /^\s*(yes,? )?i (understand|agree|acknowledge|accept|consent|certify|confirm|have read)\b/i;
const isAcknowledgement = (field) =>
  ACKNOWLEDGE.test(field.label) || field.type === "checkbox" || (field.options || []).some((o) => AGREEING_OPTION.test(o.label));

/* ---------- Voluntary self-identification and standing consent (from the profile) ---------- */

const DECLINE = /decline|prefer not|do(n't| not) wish|choose not|rather not|not to (say|answer|disclose|self.?identify)/i;

/** Which self-identification question a label asks, matching the profile column. */
function selfIdKind(label) {
  const l = String(label).toLowerCase();
  if (/pronoun/.test(l)) return "pronouns";
  if (/\bgender\b|\bsex\b/.test(l)) return "gender";
  if (/race|ethnic|hispanic|latino/.test(l)) return "race_ethnicity";
  if (/veteran/.test(l)) return "veteran_status";
  if (/disabilit/.test(l)) return "disability_status";
  return null;
}

/** Does an option label express the stored self-identification value? */
function selfIdOptionMatches(kind, stored, label) {
  const v = String(stored || "").toLowerCase().trim();
  const o = String(label).toLowerCase().trim();
  if (v === "decline") return DECLINE.test(o);
  if (DECLINE.test(o)) return false;
  switch (kind) {
    case "gender":
      if (v === "male") return /^(male|man)\b|cis.?gender man|^he\b/.test(o);
      if (v === "female") return /^(female|woman)\b|cis.?gender woman|^she\b/.test(o);
      if (v === "non_binary") return /non.?binary/.test(o);
      return o === v;
    case "pronouns": {
      const norm = (t) => t.replace(/\s+/g, "").replace(/\\/g, "/");
      return norm(o) === norm(v) || norm(o).startsWith(norm(v));
    }
    case "veteran_status":
      if (v === "not_veteran") return /not a (protected )?veteran|i am not|^no\b/.test(o);
      if (v === "veteran") return !/\bnot\b/.test(o) && /veteran|^yes\b/.test(o);
      return false;
    case "disability_status":
      if (v === "no") return /^no\b|do(n't| not) have/.test(o);
      if (v === "yes") return /^yes\b|have a disability/.test(o);
      return false;
    default:
      return o === v || o.startsWith(v) || o.includes(v);
  }
}

/** Answer a self-identification question from the profile, or null when not stored / no option fits. */
function selfIdAnswer(field, profile) {
  const kind = selfIdKind(field.label);
  const stored = kind && profile[kind];
  if (!stored) return null;
  if (!field.options?.length) return kind === "pronouns" || kind === "race_ethnicity" ? { value: String(stored), source: "profile", confidence: "high" } : null;
  const hits = field.options.filter((o) => selfIdOptionMatches(kind, stored, o.label));
  if (!hits.length) return null;
  const value = field.type === "multiselect" ? [hits[0].value] : hits[0].value;
  return { value, source: "profile", confidence: "high" };
}

// A typed full-name signature is the applicant's own act, even with standing consent.
const SIGNATURE = /signature|typ(e|ing) (in )?your (full |legal )?name|sign(ed)? (by|below)/i;

/** With the applicant's standing consent, pick the agreeing option of a declaration. */
function acknowledgementAnswer(field, profile) {
  if (!profile.auto_acknowledge || SIGNATURE.test(field.label) || (field.type !== "select" && field.type !== "checkbox" && field.type !== "multiselect")) return null;
  const opts = field.options || [];
  const agree = opts.find((o) => AGREEING_OPTION.test(o.label)) || opts.find((o) => /^\s*(yes|i agree|agree|accept|acknowledge)/i.test(o.label)) || (opts.length === 1 ? opts[0] : null);
  if (!agree) return null;
  return { value: field.type === "select" ? agree.value : [agree.value], source: "profile", confidence: "high", reason: "Confirmed with your standing consent" };
}

/** Normalised form of a question, used to reuse saved answers across employers. */
export function questionKey(label) {
  return String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);
}

const yes = (opts) => opts.find((o) => /^\s*yes\b/i.test(o.label));
const no = (opts) => opts.find((o) => /^\s*no\b/i.test(o.label));

/** First option whose label contains one of the words, for "highest education" style questions. */
function optionMatching(options, words) {
  return options.find((o) => words.some((w) => o.label.toLowerCase().includes(w)));
}

/**
 * The low–high range an option label describes, for range dropdowns common on Indian forms:
 * "≤15 Days" → [0, 15], "30 Days" → [30, 30], "60 Days - 90 Days" → [60, 90],
 * "Less than 10 LPA" → [0, 10], "45 LPA +" → [45, ∞]. Null when it has no number.
 */
export function optionRange(label) {
  const text = String(label).toLowerCase().replace(/,/g, "");
  const nums = (text.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (!nums.length) return null;
  if (/≤|<=|less than|below|under|upto|up to|max/.test(text)) return [0, nums[0]];
  if (/\+|above|more than|over|≥|>=/.test(text)) return [nums[0], Infinity];
  return [Math.min(...nums), Math.max(...nums)];
}

/** The first option whose range contains the number (e.g. notice days, CTC in LPA). */
export function rangeOption(options, n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return options.find((o) => {
    const r = optionRange(o.label);
    return r && Number(n) >= r[0] && Number(n) <= r[1];
  }) || null;
}

function splitName(resume) {
  const parts = String(resume?.name || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
}

function contactPart(resume, re) {
  return String(resume?.contact || "").match(re)?.[0] || "";
}

/** Rule-based answer for one field, or null when the rules don't know. */
function ruleAnswer(field, profile, resume) {
  const label = field.label.toLowerCase();
  const name = splitName(resume);
  const value = (v, source = "profile") => (v ? { value: String(v), source, confidence: "high" } : null);

  switch (field.id) {
    case "first_name": return value(profile.first_name || name.first, profile.first_name ? "profile" : "resume");
    case "last_name": return value(profile.last_name || name.last, profile.last_name ? "profile" : "resume");
    case "email": return value(profile.email || contactPart(resume, /[\w.+-]+@[\w-]+\.[\w.]+/), profile.email ? "profile" : "resume");
    case "phone": return value(profile.phone || contactPart(resume, /\+?\(?\d[\d\s()-]{8,}\d/), profile.phone ? "profile" : "resume");
    case "location": return value(profile.city || "");
    case "full_name": return value([profile.first_name || name.first, profile.last_name || name.last].filter(Boolean).join(" "));
    default: break;
  }
  if (/preferred (first )?name/.test(label)) return value(profile.preferred_name || profile.first_name || name.first);
  if (field.type === "url" || /linkedin|website|portfolio|github/.test(label)) {
    if (/linkedin/.test(label)) return value(profile.linkedin_url || contactPart(resume, /linkedin\.com\/in\/[\w-]+/));
    if (/website|portfolio/.test(label)) return value(profile.website_url);
    return null;
  }
  if (field.options?.length) {
    if (/(authori[sz]ed|eligible|right) to work/.test(label)) {
      const authorized = Object.values(profile.authorized_to_work || { India: true }).some(Boolean);
      const opt = authorized ? yes(field.options) : no(field.options);
      return opt ? { value: opt.value, source: "profile", confidence: "check" } : null;
    }
    if (/sponsor|visa|petition/.test(label)) {
      const opt = profile.needs_sponsorship ? yes(field.options) : no(field.options);
      return opt ? { value: opt.value, source: "profile", confidence: "check" } : null;
    }
    if (/highest (level of )?education|degree/.test(label) && profile.highest_education) {
      const opt = optionMatching(field.options, [profile.highest_education.toLowerCase()]);
      return opt ? { value: opt.value, source: "profile", confidence: "high" } : null;
    }
  }
  // Range dropdowns ("30 Days - Negotiable", "32 - 40 LPA"): pick the range the number falls in.
  if (field.options?.length) {
    const pick = (n) => {
      const opt = rangeOption(field.options, n);
      return opt ? { value: opt.value, source: "profile", confidence: "check" } : null;
    };
    if (/notice period/.test(label)) return pick(profile.notice_period_days);
    if (/\bcctc\b|current (ctc|salary|compensation|package)/.test(label)) return pick(profile.current_ctc_lpa);
    if (/\bectc\b|expected (ctc|salary|compensation|package)/.test(label)) return pick(profile.expected_ctc_lpa);
  }
  if (/notice period/.test(label) && profile.notice_period_days != null) return value(`${profile.notice_period_days} days`);
  // Indian forms often write CCTC / ECTC for current / expected CTC.
  if (/\bcctc\b|current (ctc|salary|compensation|package)/.test(label) && profile.current_ctc_lpa != null) return value(`${profile.current_ctc_lpa} LPA`);
  if (/\bectc\b|expected (ctc|salary|compensation|package)/.test(label) && profile.expected_ctc_lpa != null) return value(`${profile.expected_ctc_lpa} LPA`);
  return null;
}

/* ---------- Employment entries: each block on the form filled from one job, in resume order ---------- */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function datePart(text) {
  const t = String(text || "").toLowerCase().trim();
  if (!t) return null;
  if (/present|current|now|till|to date|ongoing/.test(t)) return { current: true };
  const year = t.match(/\b(19|20)\d{2}\b/)?.[0] || (t.match(/'(\d{2})\b/) ? `20${t.match(/'(\d{2})\b/)[1]}` : null);
  let month = MONTHS.findIndex((m) => new RegExp(`\\b${m.slice(0, 3)}`).test(t));
  if (month < 0) {
    const numeric = t.match(/\b(\d{1,2})[/.-](19|20)\d{2}\b/);
    if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) month = Number(numeric[1]) - 1;
  }
  return year || month >= 0 ? { year, month: month >= 0 ? month : null } : null;
}

/** "Mar 2024 – Mar 2026" / "01/2020-03/2023" / "2019 – Present" → { start, end, current }. */
export function parsePeriod(period) {
  const parts = String(period || "").split(/\s*(?:–|—|\bto\b)\s*|\s+-\s+|(?<=\d{4})-(?=\s*\d)/i);
  const start = datePart(parts[0]);
  const end = datePart(parts[1]);
  return { start: start?.current ? null : start, end: end?.current ? null : end, current: !!end?.current };
}

const optionFor = (field, test) => field.options?.find((o) => test(String(o.label).toLowerCase().trim()));

function monthAnswer(field, month) {
  if (month == null) return null;
  if (field.options?.length) {
    const n = String(month + 1);
    const opt = optionFor(field, (l) => l.startsWith(MONTHS[month].slice(0, 3)) || l === n || l === n.padStart(2, "0"));
    return opt ? opt.value : null;
  }
  return MONTHS[month][0].toUpperCase() + MONTHS[month].slice(1);
}

function yearAnswer(field, year) {
  if (!year) return null;
  if (field.options?.length) return optionFor(field, (l) => l.includes(year))?.value ?? null;
  return year;
}

/**
 * Answer for a field inside employment block `field.entry.index`, from that job in the resume.
 * Returns an answer, null (a known field to leave empty – e.g. end date of a current job), or
 * undefined (not a field the rules know – the AI answers it, told which job it belongs to).
 */
export function employmentAnswer(field, resume) {
  const job = (resume?.experience || [])[field.entry.index];
  if (!job) return null;
  const label = field.label.toLowerCase();
  const { start, end, current } = parsePeriod(job.period);
  const answer = (v) => (v == null || v === "" ? null : { value: String(v), source: "resume", confidence: "high" });
  if (/current|present|currently/.test(label)) {
    if (!current) return null;
    return field.options?.length ? answer((yes(field.options) || field.options[0]).value) : null;
  }
  if (/company|employer|organi[sz]ation/.test(label)) return answer(job.company);
  if (/title|role|position|designation/.test(label)) return answer(job.role);
  if (/location|city/.test(label)) return answer(job.location);
  const which = /\b(start|from|join)/.test(label) ? start : /\b(end|to|until|leav|reliev)/.test(label) ? (current ? null : end) : undefined;
  if (which === undefined) return undefined;
  if (!which) return null;
  if (/month/.test(label)) return answer(monthAnswer(field, which.month));
  if (/year/.test(label)) return answer(yearAnswer(field, which.year));
  if (/date/.test(label)) return answer(which.month != null ? `${String(which.month + 1).padStart(2, "0")}/${which.year || ""}` : which.year);
  return undefined;
}

function resumeText(resume) {
  if (!resume) return "";
  const lines = [resume.name, resume.title, resume.contact, resume.summary];
  for (const e of resume.experience || []) {
    lines.push(`${e.role} — ${e.company} (${e.period})`, ...(e.bullets || []).map((b) => `• ${b}`));
  }
  for (const e of resume.education || []) lines.push(typeof e === "string" ? e : [e.degree, e.school, e.period].filter(Boolean).join(", "));
  if (resume.skills) lines.push(`Skills: ${[].concat(resume.skills).join(", ")}`);
  return lines.filter(Boolean).join("\n").slice(0, 12000);
}

const SYSTEM = `You fill job application forms for a candidate, who reviews every answer before anything is sent.
Answer ONLY from the candidate's resume and profile. Never invent employers, dates, numbers, skills or facts.
If the resume and profile don't answer a question, return it with "value": null.
For questions with options, "value" must be the exact "value" of one option (or, for multiselect, an array of them).
For free-text questions, write a concise first-person answer (2-5 sentences) grounded in the resume.
"Have you worked for <this company> before?": if no role at that company appears in the resume, answer No with "confidence":"check".
Return JSON: {"answers":[{"id":"<field id>","value":<string|array|null>,"confidence":"high"|"check","reason":"<6-12 words>"}]}`;

/**
 * Fill a form. `profile` is the applicant_profiles row (may be partial); `resume` is ResumeIQ's
 * parsed resume; `job` is { title, company }.
 */
export async function fillForm({ fields, profile = {}, resume = null, job = {} }) {
  const answers = {};
  const needsYou = [];
  const forAi = [];
  const saved = profile.saved_answers || {};

  for (const field of fields) {
    if (field.type === "file") {
      if (field.id === "resume") answers[field.id] = { value: "resume", source: "resume", confidence: "high" };
      continue; // cover letter stays optional
    }
    if (field.section === "voluntary" || DIVERSITY.test(field.label) || selfIdKind(field.label)) {
      const own = selfIdAnswer(field, profile);
      if (own) answers[field.id] = own;
      else needsYou.push({ id: field.id, reason: field.required ? "Add it in your profile (voluntary details)" : "Optional – left blank" });
      continue;
    }
    if (isAcknowledgement(field)) {
      const ack = acknowledgementAnswer(field, profile);
      if (ack) answers[field.id] = ack;
      else needsYou.push({ id: field.id, reason: SIGNATURE.test(field.label) ? "Type your name to sign" : "Needs your own acknowledgement" });
      continue;
    }
    if (field.entry?.kind === "employment") {
      const own = employmentAnswer(field, resume);
      if (own) answers[field.id] = own;
      else if (own === null) answers[field.id] = { value: null, source: "resume", blank: true }; // e.g. end date of a current job
      if (own !== undefined) continue;
      // Not a field the rules know (e.g. a description): the AI answers it for that job.
      const job = (resume?.experience || [])[field.entry.index] || {};
      forAi.push({ ...field, label: `Job ${field.entry.index + 1} (${job.role || ""} at ${job.company || ""}) – ${field.label}` });
      continue;
    }
    const savedAnswer = saved[questionKey(field.label)];
    const validSaved = savedAnswer != null && (!field.options || field.options.some((o) => o.value === savedAnswer));
    if (validSaved) {
      answers[field.id] = { value: savedAnswer, source: "saved", confidence: "high" };
      continue;
    }
    const rule = ruleAnswer(field, profile, resume);
    if (rule) answers[field.id] = rule;
    else forAi.push(field);
  }

  if (forAi.length) {
    const user = JSON.stringify({
      job,
      profile: { city: profile.city, current_ctc_lpa: profile.current_ctc_lpa, expected_ctc_lpa: profile.expected_ctc_lpa, notice_period_days: profile.notice_period_days, highest_education: profile.highest_education },
      resume: resumeText(resume),
      questions: forAi.map((f) => ({ id: f.id, label: f.label, type: f.type, description: f.description || undefined, options: f.options })),
    });
    let parsed = { answers: [] };
    try {
      const raw = String(await callLLM({ system: SYSTEM, user, maxTokens: 2500, json: true })).replace(/```json|```/g, "").trim();
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn("[easy-apply] AI fill failed:", err.message);
    }
    const byId = new Map((parsed.answers || []).map((a) => [a.id, a]));
    for (const field of forAi) {
      const a = byId.get(field.id);
      let value = a?.value;
      if (value != null && field.options) {
        const valid = new Set(field.options.map((o) => o.value));
        value = Array.isArray(value) ? value.filter((v) => valid.has(String(v))).map(String) : valid.has(String(value)) ? String(value) : null;
        if (Array.isArray(value) && !value.length) value = null;
      }
      if (value == null || value === "") needsYou.push({ id: field.id, reason: a?.reason || "Not in your resume or profile" });
      // AI answers are always for the applicant to check, however sure the model says it is.
      else answers[field.id] = { value, source: "ai", confidence: "check", reason: a?.reason };
    }
  }
  return { answers, needsYou };
}
