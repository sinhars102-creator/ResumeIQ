/**
 * Module M2 – read check.
 *
 * After a resume file is read and structured, compare the raw text with the structured resume and report
 * what looks lost: emails, links, phone numbers, years, figures, and whole lines that were never placed.
 * Pure function (no network, no AI), so the checks are predictable and easy to test.
 *
 *   checkRead(rawText, resume) -> { ok, coverage, missing: { emails, links, phones, years, numbers, lines }, summary }
 *
 * It can only flag; it never changes the resume. Words that were reworded when structuring the resume
 * ("Led" for "Leading") are tolerated for lines, but exact figures and contact details must survive.
 */

const flatten = (v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === "object" ? Object.values(v).flatMap(flatten) : []);

const squash = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
const digitsOnly = (s) => String(s || "").replace(/\D/g, "");
const wordsOf = (s) => String(s || "").toLowerCase().match(/[a-z0-9][a-z0-9+#.'&-]*/g) || [];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LINK = /(?:https?:\/\/|www\.|(?:linkedin|github|behance|dribbble|medium)\.com\/)[^\s)<>,;|]+/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const YEAR = /\b(?:19[89]\d|20[0-4]\d)\b/g;
// A figure with 2+ digits, optionally with separators, %, currency or a unit (40%, 1,200, ₹5 Cr, 3.5x).
const NUMBER = /(?:[₹$€£]\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|x|k\b|m\b|cr\b|crore\b|lakh\b|lpa\b)?/gi;

const clean = (s) => String(s).replace(/[.,;:)\]]+$/, "");
const uniq = (list) => [...new Set(list)];

/** Lines of the raw text worth checking: real sentences or bullets, not names, headings or contact rows. */
function contentLines(raw) {
  return String(raw || "")
    .split(/\r?\n+/)
    .map((l) => l.replace(/^[\s•·▪●◦*\-–—]+/, "").trim())
    .filter((l) => wordsOf(l).length >= 6 && !EMAIL.test(l) && !/^(?:https?:|www\.)/i.test(l))
    .map((l) => ((EMAIL.lastIndex = 0), l));
}

export function checkRead(rawText, resume) {
  const raw = String(rawText || "");
  const parsedStrings = flatten(resume || {});
  const parsedText = parsedStrings.join("\n");
  const parsedSquash = squash(parsedText);
  const parsedDigitRuns = new Set((parsedText.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, "")));
  const parsedDigits = digitsOnly(parsedText);
  const parsedWords = new Set(wordsOf(parsedText));

  const emails = uniq((raw.match(EMAIL) || []).map((e) => e.toLowerCase())).filter((e) => !parsedSquash.includes(squash(e)));
  const links = uniq((raw.match(LINK) || []).map(clean))
    .filter((l) => !parsedSquash.includes(squash(l.replace(/^https?:\/\//i, "").replace(/^www\./i, ""))))
    // A LinkedIn/GitHub link kept without its scheme still counts as kept.
    .filter((l) => !parsedSquash.includes(squash(l.replace(/^https?:\/\/(www\.)?/i, ""))));
  const phones = uniq((raw.match(PHONE) || []).map(digitsOnly).filter((d) => d.length >= 8 && d.length <= 13))
    .filter((d) => !parsedDigits.includes(d.slice(-10)));
  const years = uniq(raw.match(YEAR) || []).filter((y) => !parsedText.includes(y));
  const numbers = uniq(
    (raw.match(NUMBER) || [])
      .map((n) => n.trim())
      .filter((n) => digitsOnly(n).length >= 2 && !/^(19|20)\d\d$/.test(n) && digitsOnly(n).length < 9)
      .filter((n) => !parsedDigitRuns.has(digitsOnly(n).replace(/^0+/, "") || "0") && !parsedDigitRuns.has(n.replace(/[^\d.]/g, "").replace(/,/g, "")))
  );

  // Whole lines that left almost no trace in the structured resume.
  const lines = contentLines(raw)
    .filter((l) => {
      const ws = wordsOf(l);
      const hit = ws.filter((w) => parsedWords.has(w)).length;
      return hit / ws.length < 0.45;
    })
    .slice(0, 6);

  const rawWords = wordsOf(raw).length;
  const kept = wordsOf(parsedText).length;
  const coverage = rawWords ? Math.min(1, kept / rawWords) : 1;

  const missing = { emails, links, phones, years, numbers: numbers.slice(0, 12), lines };
  // Few stray items are noise (a year in a sentence, a page number); report when something concrete is missing.
  const flagged = emails.length + links.length + phones.length + years.length >= 1 || numbers.length >= 1 || lines.length >= 2 || (rawWords >= 80 && coverage < 0.5);
  return { ok: !flagged, coverage, missing, summary: summarize(missing, coverage, rawWords, flagged) };
}

function summarize(m, coverage, rawWords, flagged) {
  if (!flagged) return "";
  const parts = [];
  if (m.emails.length) parts.push(`email ${m.emails.join(", ")}`);
  if (m.phones.length) parts.push(`phone number ${m.phones.join(", ")}`);
  if (m.links.length) parts.push(`link ${m.links.join(", ")}`);
  if (m.years.length) parts.push(`year${m.years.length > 1 ? "s" : ""} ${m.years.join(", ")}`);
  if (m.numbers.length) parts.push(`figure${m.numbers.length > 1 ? "s" : ""} ${m.numbers.slice(0, 6).join(", ")}`);
  if (m.lines.length >= 2) parts.push(`${m.lines.length} lines of text I couldn't place`);
  if (!parts.length && rawWords >= 80 && coverage < 0.5) parts.push("a large part of the text");
  return parts.join("; ");
}
