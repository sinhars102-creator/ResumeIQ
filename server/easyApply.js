/**
 * Easy Apply, phase 1: fetch an employer's real application form and fill it for review.
 * Nothing is submitted here – submission is phase 2.
 *
 * Forms come from Greenhouse's public job board API (?questions=true), which lists every
 * question with its type, options and whether it's required. They're converted into one
 * field shape so the app can draw any employer's form:
 *   { id, label, type, required, options?, section, accept? }
 *   type: text | email | phone | url | textarea | select | multiselect | file | checkbox
 */
import { htmlToPlain } from "./jobSources.js";

const FETCH_TIMEOUT_MS = 15000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Which sites Easy Apply can draw forms for, from a ResumeIQ job id ("gh-airbnb-8189782"). */
export function easyApplyTarget(jobId) {
  const m = String(jobId || "").match(/^gh-([A-Za-z0-9_-]+)-(\d+)$/);
  return m ? { ats: "greenhouse", board: m[1], jobId: m[2] } : null;
}

const GH_TYPES = {
  input_text: "text",
  textarea: "textarea",
  input_file: "file",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
  input_hidden: null,
};

/** Refine a text field's type from its label ("Email" → email, "LinkedIn Profile" → url). */
function refineTextType(label, name) {
  const l = `${label} ${name}`.toLowerCase();
  if (/\bemail\b/.test(l)) return "email";
  if (/\bphone\b|\bmobile\b/.test(l)) return "phone";
  if (/linkedin|website|portfolio|github|\burl\b/.test(l)) return "url";
  return "text";
}

function ghOptions(field) {
  return (field.values || []).map((v) => ({ value: String(v.value), label: String(v.label) }));
}

/**
 * One Greenhouse question → our field. A question with several inputs (e.g. Resume: file
 * or paste text) becomes one field of its first usable type; resume/cover letter take a file.
 */
function fromGreenhouseQuestion(q, section) {
  const fields = (q.fields || []).filter((f) => GH_TYPES[f.type] !== null && GH_TYPES[f.type] !== undefined);
  if (!fields.length) return null;
  const file = fields.find((f) => f.type === "input_file");
  const primary = file || fields[0];
  let type = GH_TYPES[primary.type];
  if (type === "text") type = refineTextType(q.label, primary.name);
  // A single-option select is usually an acknowledgement ("I have read the privacy policy").
  const options = ghOptions(primary);
  if (type === "multiselect" && options.length === 1) type = "checkbox";
  const label = htmlToPlain(String(q.label || "")).trim();
  return {
    id: primary.name,
    label,
    description: q.description ? htmlToPlain(q.description).trim().slice(0, 600) : "",
    type,
    required: !!q.required,
    section,
    ...(options.length ? { options } : {}),
    ...(type === "file" ? { accept: ".pdf,.doc,.docx,.txt,.rtf" } : {}),
  };
}

/** Greenhouse job → { job, fields, applyUrl } in our form shape. */
export async function fetchGreenhouseForm(board, jobId) {
  const d = await getJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(jobId)}?questions=true`,
  );
  const fields = [];
  for (const q of d.questions || []) {
    const f = fromGreenhouseQuestion(q, "application");
    if (f) fields.push(f);
  }
  for (const q of d.location_questions || []) {
    const f = fromGreenhouseQuestion(q, "location");
    if (f) fields.push(f);
  }
  // Voluntary diversity questions (US EEO): optional, never filled automatically.
  for (const block of d.compliance || []) {
    for (const q of block.questions || []) {
      const f = fromGreenhouseQuestion(q, "voluntary");
      if (f) fields.push({ ...f, required: false });
    }
  }
  return {
    ats: "greenhouse",
    board,
    jobId: String(jobId),
    job: { title: d.title, company: d.company_name || board, location: d.location?.name || "" },
    applyUrl: d.absolute_url,
    fields,
  };
}

export async function fetchEasyApplyForm(resumeIqJobId) {
  const target = easyApplyTarget(resumeIqJobId);
  if (!target) return null;
  return fetchGreenhouseForm(target.board, target.jobId);
}
