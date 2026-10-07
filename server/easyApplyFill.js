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
const ACKNOWLEDGE = /\b(privacy (policy|notice)|attest\w*|acknowledg\w*|consent\w*|i (have read|agree|certify|confirm)|terms (and|&) conditions|declaration)\b/i;

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
  if (/notice period/.test(label) && profile.notice_period_days != null) return value(`${profile.notice_period_days} days`);
  // Indian forms often write CCTC / ECTC for current / expected CTC.
  if (/\bcctc\b|current (ctc|salary|compensation|package)/.test(label) && profile.current_ctc_lpa != null) return value(`${profile.current_ctc_lpa} LPA`);
  if (/\bectc\b|expected (ctc|salary|compensation|package)/.test(label) && profile.expected_ctc_lpa != null) return value(`${profile.expected_ctc_lpa} LPA`);
  return null;
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
    if (field.section === "voluntary" || DIVERSITY.test(field.label)) {
      needsYou.push({ id: field.id, reason: "Voluntary – your choice to answer" });
      continue;
    }
    if (ACKNOWLEDGE.test(field.label) || field.type === "checkbox") {
      needsYou.push({ id: field.id, reason: "Needs your own acknowledgement" });
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
