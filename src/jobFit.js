/**
 * Job fit for the job board: how a recruiter would judge a role against a candidate at first glance.
 * Plain JavaScript (no browser or Node APIs), so the website and the API server can share it.
 *
 * Every role gets:
 *  - hard filters: a different role family, far more senior or far more junior than the candidate,
 *    or posted more than MAX_AGE_DAYS ago -> hidden (with the reason, so the board can say what it hid);
 *  - a 0-100 fit score: title relevance (40), skills and keywords (30), experience (20), freshness (10).
 *    75+ is a Strong match, 55-74 Good, below that a Stretch.
 */
import { scoreParts, parseJdYearsRange } from "./matchScore.js";

export const MAX_AGE_DAYS = 30;
export const STRONG_FIT = 75;
export const GOOD_FIT = 55;

/** Role families, matched on the job title. Order matters: the first family that matches wins. */
const FAMILIES = [
  ["pm", /\b(product (manager|management|owner|lead|head|director)|head of product|(vp|director)[, ]+(of )?product|chief product|apm|group pm|product ops)\b|\bpm\b/],
  ["program", /\b(program|project|delivery) (manager|management|lead|director)\b|\bscrum master\b|\btpm\b/],
  ["data", /\b(data (scien|analy|engineer)|machine learning|\bml\b|\bai\b engineer|analytics|bi (developer|analyst)|business intelligence|statistic)/],
  ["swe", /\b(engineer|engineering|developer|sde|programmer|devops|sre|full[- ]?stack|back[- ]?end|front[- ]?end|android|ios|architect|qa|test automation|tech lead|cto)\b/],
  ["design", /\b(designer|design lead|ux|ui\b|user experience|user research)/],
  ["analyst", /\b(business analyst|analyst|associate consultant|consultant|strategy|chief of staff|founder'?s office|bizops|business operations)\b/],
  ["marketing", /\b(marketing|growth|seo|content|brand|performance marketing|social media|communications|pr)\b/],
  ["sales", /\b(sales|account (executive|manager)|business development|bdr|sdr|partnerships|key account)\b/],
  ["success", /\b(customer success|customer support|customer experience|support (engineer|specialist)|implementation)\b/],
  ["ops", /\b(operations|supply chain|logistics|procurement|category manager|warehouse|fulfil?ment)\b/],
  ["finance", /\b(finance|financial|accountant|accounting|audit|tax|treasury|fp&a|controller|investment)\b/],
  ["hr", /\b(hr|human resources|recruit|talent|people (partner|operations)|payroll)\b/],
];

/** Families close enough that a candidate in one could reasonably apply to the other. */
const ADJACENT = {
  pm: ["program", "analyst"],
  program: ["pm", "ops"],
  data: ["swe", "analyst"],
  swe: ["data"],
  analyst: ["pm", "data", "ops", "finance"],
  ops: ["analyst", "program"],
  marketing: ["sales"],
  sales: ["marketing", "success"],
  success: ["sales", "ops"],
  design: [],
  finance: ["analyst"],
  hr: [],
};

export function roleFamily(title) {
  const t = ` ${String(title || "").toLowerCase()} `;
  for (const [family, re] of FAMILIES) if (re.test(t)) return family;
  return null;
}

/**
 * Seniority from a job title, 0-6: 0 intern, 1 entry/associate/junior, 2 mid, 3 senior,
 * 4 lead/staff/principal/group, 5 director/head, 6 VP/chief.
 */
export function titleLevel(title) {
  const t = ` ${String(title || "").toLowerCase()} `;
  if (/\b(intern|internship|trainee|apprentice)\b/.test(t)) return 0;
  if (/\b(vp|vice president|chief|cxo|cto|cpo|ceo|coo|cfo)\b/.test(t)) return 6;
  if (/\b(director|head of|head,|\bhead\b)/.test(t)) return 5;
  if (/\b(lead|staff|principal|group|architect|manager of)\b/.test(t)) return 4;
  if (/\b(senior|sr\.?|sr|iii|level 3|l3|sde ?3|sde-iii)\b/.test(t)) return 3;
  if (/\b(associate|junior|jr\.?|entry|graduate|fresher|i\b|level 1|l1|sde ?1|sde-i)\b/.test(t) || /\bapm\b/.test(t)) return 1;
  return 2;
}

/** The level a candidate with this many years of experience usually holds (same 0-6 scale). */
export function levelForYears(years) {
  if (years == null) return null;
  if (years < 1) return 1;
  if (years < 3) return 1.5;
  if (years < 6) return 2.5;
  if (years < 9) return 3.5;
  if (years < 13) return 4.5;
  if (years < 18) return 5;
  return 6;
}

const TITLE_NOISE = new Set([
  "senior", "sr", "junior", "jr", "lead", "staff", "principal", "associate", "head", "director", "vp", "chief",
  "manager", "ii", "iii", "iv", "i", "intern", "the", "and", "for", "of", "with", "remote", "hybrid", "india", "-",
]);
function titleTokens(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !TITLE_NOISE.has(w));
}

/** How many days ago a role was posted (or first seen), or null when unknown. */
export function ageInDays(job, now = Date.now()) {
  const posted = Date.parse(job.postedAt || "") || Number(job.firstSeenAt) || Date.parse(job.firstSeenAt || "") || null;
  if (!posted) return null;
  return Math.max(0, (now - posted) / 86400000);
}

/**
 * The candidate side, built once per board: role families and title words from their target roles,
 * current title and the last two roles; level from years of experience.
 */
export function candidateProfile(resume, { roles = [], years = null } = {}) {
  const titles = [
    ...roles,
    resume?.title,
    ...((resume?.experience || []).slice(0, 2).map((e) => e.role)),
  ].filter(Boolean);
  const families = new Set(titles.map(roleFamily).filter(Boolean));
  const words = new Set(titles.flatMap(titleTokens));
  return { titles, families, words, years, level: levelForYears(years) };
}

/** Title relevance 0-1: same family and shared title words score highest; adjacent families half. */
function titleRelevance(jobTitle, family, profile) {
  const tokens = titleTokens(jobTitle);
  const overlap = tokens.length ? tokens.filter((w) => profile.words.has(w)).length / tokens.length : 0;
  if (!profile.families.size) return Math.min(1, 0.3 + overlap);
  if (family && profile.families.has(family)) return 0.75 + 0.25 * overlap;
  if (family && [...profile.families].some((f) => (ADJACENT[f] || []).includes(family))) return 0.4 + 0.2 * overlap;
  if (!family) return 0.5 * overlap;
  return 0;
}

/**
 * Clearly below the candidate: an entry title for someone with 3+ years, a title three levels down,
 * or a JD whose experience range tops out 4+ years under theirs. A JD asking for close to their years
 * keeps the role, whatever the title says ("Product Manager, 8+ years" for a 9-year PM).
 */
function isTooJunior(jobLevel, range, profile) {
  const years = profile.years;
  if (range && years != null && range.min >= years - 3) return false;
  if (jobLevel <= 1 && years != null && years >= 3) return true;
  if (profile.level - jobLevel >= 3) return true;
  return !!(range?.max != null && years != null && range.max <= years - 4);
}

/**
 * Judge one role. Returns { show, reason, fit, label, parts }.
 * `reason` (when hidden): "different_role" | "too_senior" | "too_junior" | "stale".
 */
export function assessJob(job, profile, resume, { now = Date.now() } = {}) {
  const family = roleFamily(job.role);
  const relevance = titleRelevance(job.role, family, profile);
  const age = ageInDays(job, now);
  const jobLevel = titleLevel(job.role);
  const range = parseJdYearsRange(`${job.role || ""} ${job.jd || ""}`);

  let reason = null;
  if (profile.families.size && family && relevance === 0) reason = "different_role";
  else if (profile.level != null && (jobLevel - profile.level >= 1.5 || (range && profile.years != null && range.min - profile.years >= 4))) reason = "too_senior";
  else if (profile.level != null && isTooJunior(jobLevel, range, profile)) reason = "too_junior";
  else if (age != null && age > MAX_AGE_DAYS) reason = "stale";

  const parts = scoreParts(resume, job, profile.years);
  const skillShare = parts ? (parts.skills + parts.keywords) / 50 : 0.3;
  const experience = parts?.fit ? parts.fit.points / 25 : 0.7;
  const freshness = age == null ? 0.5 : age <= 7 ? 1 : age <= 14 ? 0.8 : age <= 30 ? 0.5 : 0;

  const fit = Math.round(40 * relevance + 30 * skillShare + 20 * experience + 10 * freshness);
  const label = fit >= STRONG_FIT ? "Strong" : fit >= GOOD_FIT ? "Good" : "Stretch";
  return {
    show: !reason,
    reason,
    fit: Math.max(5, Math.min(98, fit)),
    label,
    family,
    ageDays: age,
    matchedSkills: parts?.matchedSkills || [],
  };
}

/**
 * Recommended order: fit band (Strong, Good, Stretch), then company tier (1 most wanted) within the band,
 * then the exact fit, then newest. A point of fit never pushes an unknown company above a top one.
 */
export function byFitThenTier(assessments) {
  const band = (fit) => (fit >= STRONG_FIT ? 0 : fit >= GOOD_FIT ? 1 : 2);
  return (a, b) => {
    const fa = assessments.get(a.id)?.fit ?? 0;
    const fb = assessments.get(b.id)?.fit ?? 0;
    if (band(fa) !== band(fb)) return band(fa) - band(fb);
    const ta = a.tier ?? 3;
    const tb = b.tier ?? 3;
    if (ta !== tb) return ta - tb;
    if (fb !== fa) return fb - fa;
    return (ageInDays(a) ?? 999) - (ageInDays(b) ?? 999);
  };
}
