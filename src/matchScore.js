/**
 * Match scoring, shared by the website (src/ResumeIQ.jsx) and the API server (the Chrome extension's
 * match card), so a job gets the same score in both. Every score has four 0–25 parts: skills (the
 * role's must-haves the resume shows – judged by the AI), experience (years vs the JD's range),
 * impact (quantified bullets) and keywords (the JD's repeated terms in the resume), all but skills
 * computed here. Plain JavaScript, no browser or Node APIs.
 */

/** The tier label for a score (the website colours it; the extension shows it on the ring). */
export function scoreLabel(score) {
  if (score >= 75) return "Strong Match";
  if (score >= 55) return "Moderate Match";
  return "Needs Alignment";
}

export const MATCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "will", "are", "that", "this",
  "from", "have", "has", "our", "to", "of", "in", "on", "at", "as", "is",
  "be", "by", "or", "we", "it", "its", "their", "they", "them", "who",
  "what", "when", "where", "why", "how", "not", "but", "if", "can",
  "across", "into", "more", "most", "also", "than", "then", "over",
  "under", "about", "each", "every", "both", "other", "such", "only",
  "own", "same", "too", "very", "just", "should", "now", "new", "team",
  "teams", "role", "work", "working", "years", "year",
]);

export function tokenizeForMatch(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !MATCH_STOPWORDS.has(w));
}

export function buildResumeCorpus(resume) {
  const parts = [
    resume.title || "",
    resume.summary || "",
    (resume.skills || []).join(" "),
    (resume.certifications || []).join(" "),
    (resume.achievements || []).join(" "),
    ...(resume.experience || []).flatMap((e) => [e.role || "", ...(e.bullets || [])]),
  ];
  return parts.join(" \n ");
}

/**
 * Experience points out of 25 from the candidate's years vs the JD's required range.
 * Computed in code so the card estimate and the AI analysis agree, and it never varies between runs.
 */
function experienceFit(candidateYears, jd) {
  const range = parseJdYearsRange(jd);
  if (!candidateYears || !range) return null;
  const { min, max } = range;
  let points;
  if (candidateYears >= min) points = max != null && candidateYears > max + 4 ? 20 : 25;
  else points = Math.round((25 * candidateYears) / min);
  const required = max != null ? `${min}–${max}` : `${min}+`;
  return { points, candidateYears, required, short: candidateYears < min };
}

/**
 * Client-side keyword/skills overlap score — no API calls, so it can run
 * instantly across an entire job grid (up to 150 results) without hitting
 * Claude rate limits or cost. The detailed Claude-scored breakdown still
 * runs on-demand in scoreResume() once a specific job is opened.
 */
/** Share of resume bullets that show a measurable result (numbers, %, currency, multipliers). */
function impactPoints(resume) {
  const bullets = (resume.experience || []).flatMap((e) => e.bullets || []).filter(Boolean);
  if (!bullets.length) return 0;
  const quantified = bullets.filter((b) => /\d|%|₹|\$|€|£/.test(b)).length;
  // Half of the bullets quantified earns full marks.
  return Math.round(25 * Math.min(1, quantified / bullets.length / 0.5));
}

/**
 * The four 0–25 parts behind every match score. Keywords, impact and experience are computed here
 * and shared by the quick estimate and the AI analysis; only "skills" differs between them.
 */
export function scoreParts(resume, job, candidateYears = getCandidateYears(resume)) {
  if (!resume || !job) return null;
  const jdText = `${job.role || ""} ${job.jd || ""}`;
  const jdTokens = tokenizeForMatch(jdText);
  const resumeTokens = tokenizeForMatch(buildResumeCorpus(resume));
  if (!jdTokens.length || !resumeTokens.length) return null;

  // Terms the JD repeats are its real requirements; one-off words are mostly boilerplate.
  const resumeSet = new Set(resumeTokens);
  const jdFreq = new Map();
  jdTokens.forEach((t) => jdFreq.set(t, (jdFreq.get(t) || 0) + 1));
  const repeated = [...jdFreq.entries()].filter(([, count]) => count >= 2);
  const signalTerms = repeated.length >= 8 ? repeated : [...jdFreq.entries()];
  let matchedWeight = 0;
  let totalWeight = 0;
  signalTerms.forEach(([term, count]) => {
    const weight = Math.min(count, 4);
    totalWeight += weight;
    if (resumeSet.has(term)) matchedWeight += weight;
  });
  const keywordShare = totalWeight ? matchedWeight / totalWeight : 0;

  // Estimate of skills: how many of the role's skills the candidate lists – not the share of a long list.
  const skills = resume.skills || [];
  const jdLower = jdText.toLowerCase();
  const matchedSkills = skills.filter((s) => s && jdLower.includes(s.toLowerCase()));
  const skillShare = skills.length ? Math.min(1, matchedSkills.length / Math.min(skills.length, 8)) : keywordShare;

  const fit = experienceFit(candidateYears, jdText);
  return {
    skills: Math.round(25 * skillShare),
    experience: fit ? fit.points : 20,
    impact: impactPoints(resume),
    keywords: Math.round(25 * keywordShare),
    matchedSkills,
    fit,
  };
}

/**
 * Instant estimate for the job grid (no API calls): the same four parts as the AI analysis,
 * with skills estimated from the resume's skill list instead of the role's must-haves.
 */
export function computeLocalMatchScore(resume, job, candidateYears = getCandidateYears(resume)) {
  const parts = scoreParts(resume, job, candidateYears);
  if (!parts) return null;
  const score = parts.skills + parts.experience + parts.impact + parts.keywords;
  return { score: Math.max(5, Math.min(98, score)), matchedSkills: parts.matchedSkills };
}

/** Total years of experience: the parser's figure, else the span from the earliest role's start year to today. */
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/**
 * A role period ("Aug 2018 – Oct 2019", "Jan 2024 – Present", "03/2021 - 12/2021", "2019 – 2021") as an
 * inclusive range of month indexes (year * 12 + month), or null if it has no recognisable dates.
 * A year without a month starts in January / ends in December.
 */
export function parsePeriod(period, now = new Date()) {
  const text = String(period || "").toLowerCase();
  const points = [];
  const re = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*,?\s*|(\d{1,2})\s*[/.-]\s*)?((?:19|20)\d{2})|\b(present|current|now|till date|to date|ongoing)\b/g;
  let m;
  while ((m = re.exec(text)) && points.length < 2) {
    if (m[4]) points.push({ index: now.getFullYear() * 12 + now.getMonth(), monthKnown: true });
    else {
      const month = m[1] ? MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)] : m[2] ? Number(m[2]) - 1 : null;
      points.push({ year: Number(m[3]), month: month != null && month >= 0 && month <= 11 ? month : null });
    }
  }
  if (!points.length) return null;
  const toIndex = (p, isEnd) => (p.index != null ? p.index : p.year * 12 + (p.month != null ? p.month : isEnd ? 11 : 0));
  const start = toIndex(points[0], false);
  const end = points[1] ? toIndex(points[1], true) : toIndex(points[0], true);
  return end >= start ? { start, end: Math.min(end, now.getFullYear() * 12 + now.getMonth()) } : null;
}

/**
 * Total experience from the roles' dates: months worked (overlapping roles counted once) / 12, plus
 * the gaps between roles. This is what the resume's history adds up to, whatever its summary claims.
 */
export function experienceFromRoles(resume, now = new Date()) {
  const ranges = (resume?.experience || [])
    .map((e) => parsePeriod(e.period, now))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  if (!ranges.length) return null;
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const months = merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  const gaps = [];
  for (let i = 1; i < merged.length; i++) {
    const gapMonths = merged[i].start - merged[i - 1].end - 1;
    if (gapMonths > 3) gaps.push({ from: merged[i - 1].end + 1, to: merged[i].start - 1, months: gapMonths });
  }
  return { months, years: Math.round((months / 12) * 10) / 10, start: merged[0].start, gaps };
}

/** Years of experience: from the roles' dates when they can be read, else the figure the resume states. */
export function getCandidateYears(resume) {
  if (!resume) return null;
  const fromRoles = experienceFromRoles(resume);
  if (fromRoles && fromRoles.months > 0) return fromRoles.years;
  const stated = Number(resume.yearsOfExperience);
  return Number.isFinite(stated) && stated > 0 ? Math.round(stated) : null;
}

/** Years range a JD asks for, e.g. "4-6 years" → { min: 4, max: 6 }, "5+ years" → { min: 5, max: null }. */
export function parseJdYearsRange(jd) {
  const match = (jd || "").match(/(\d{1,2})\s*(?:(?:-|–|—|to)\s*(\d{1,2}))?\s*(\+)?\s*(?:\+\s*)?years?/i);
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : null;
  if (min > 30 || (max != null && max < min)) return null;
  return { min, max };
}

/** The resume without its embedded photo – the AI never needs it, and the data URL alone can exceed request limits. */
export function resumeForAI(resume) {
  if (!resume) return resume;
  // eslint-disable-next-line no-unused-vars
  const { photoUrl, ...rest } = resume;
  const computed = experienceFromRoles(resume);
  return computed ? { ...rest, totalExperience: `${computed.years} years (${computed.months} months across listed roles)` } : rest;
}

/**
 * The match score for one resume and job, shared by the website and the Chrome extension (via the API
 * server) so both show the same number. `callLLM(system, user, maxTokens)` returns the model's text.
 */
export async function scoreResume(job, resumeData, candidateYears = getCandidateYears(resumeData), callLLM) {
  // Used for any field the model leaves out; on a failed call the step shows "Score unavailable" instead of made-up numbers.
  const fallback = {
    score: null,
    label: "Score unavailable",
    summary: "",
    breakdown: { skills: 0, experience: 0, impact: 0, keywords: 0 },
    keyGaps: [],
  };
  try {
    const system =
      "You are a professional resume evaluator. Return ONLY valid JSON, no markdown.";
    const parts = scoreParts(resumeData, job, candidateYears);
    const fit = parts?.fit;
    const user = `You are evaluating how well a candidate's resume matches a specific job description.
${fit ? `The candidate has ${fit.candidateYears} years of experience; the role asks for ${fit.required} years.\n` : ""}
List the role's must-have skills, tools and certifications (6–10, from the JD's requirements, not nice-to-haves),
and for each say whether the resume clearly shows it (stated skill, certification, or work described in a bullet).

Return ONLY a JSON object with this shape:
{
  "summary": "2–3 sentence overview of fit.",
  "mustHaveSkills": [{ "skill": "name", "candidateHas": true }],
  "keyGaps": ["gap 1", "gap 2", "gap 3"]
}

Job description:
${job.jd}

Resume JSON:
${JSON.stringify(resumeForAI(resumeData), null, 2)}`;
    const text = await callLLM(system, user, 1500);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    // Scores are computed here from the facts, so the same resume and job always give the same breakdown.
    const mustHaves = Array.isArray(parsed.mustHaveSkills) ? parsed.mustHaveSkills.filter((m) => m && m.skill) : [];
    if (parts) {
      parsed.breakdown = {
        skills: mustHaves.length ? Math.round((25 * mustHaves.filter((m) => m.candidateHas === true).length) / mustHaves.length) : parts.skills,
        experience: parts.experience,
        impact: parts.impact,
        keywords: parts.keywords,
      };
      parsed.score = parsed.breakdown.skills + parsed.breakdown.experience + parsed.breakdown.impact + parsed.breakdown.keywords;
      parsed.label = scoreLabel(parsed.score);
    }
    return {
      score: typeof parsed.score === "number" ? parsed.score : fallback.score,
      label: parsed.label || fallback.label,
      summary: parsed.summary || fallback.summary,
      breakdown: {
        skills:
          parsed.breakdown && typeof parsed.breakdown.skills === "number"
            ? parsed.breakdown.skills
            : fallback.breakdown.skills,
        experience:
          parsed.breakdown && typeof parsed.breakdown.experience === "number"
            ? parsed.breakdown.experience
            : fallback.breakdown.experience,
        impact:
          parsed.breakdown && typeof parsed.breakdown.impact === "number"
            ? parsed.breakdown.impact
            : fallback.breakdown.impact,
        keywords:
          parsed.breakdown && typeof parsed.breakdown.keywords === "number"
            ? parsed.breakdown.keywords
            : fallback.breakdown.keywords,
      },
      mustHaveSkills: mustHaves.map((m) => ({ skill: String(m.skill), candidateHas: m.candidateHas === true })),
      keyGaps:
        Array.isArray(parsed.keyGaps) && parsed.keyGaps.length
          ? parsed.keyGaps.slice(0, 3)
          : fallback.keyGaps,
    };
  } catch (e) {
    console.error("Score error:", e);
    return {
      ...fallback,
      unavailable: true,
      summary: `We couldn't score this resume against the job (${e.message || "AI request failed"}). The assistant below can still help you tailor it.`,
    };
  }
}
