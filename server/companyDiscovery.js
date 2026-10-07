/**
 * Career-board discovery: for each company we know by name (from collected postings or
 * the curated list), look for a public board on Greenhouse, Lever, Ashby or Workable by
 * trying likely board names. A board counts when it lists open roles in India (or remote
 * with no country); the company is then collected on every run.
 *
 * Board names are guessed from the company name, so an unrelated company with the same
 * name can occasionally match (most likely on Lever, whose API doesn't return the
 * company name). Requiring India roles keeps that rare; set status 'disabled' to drop one.
 */
import { fetchBoard, isIndiaScope } from "./jobSources.js";
import { companyKey } from "./jobStore.js";

const ATS_ORDER = ["greenhouse", "lever", "ashby", "workable"];
const PROBE_TIMEOUT_MS = 15000;
// Words dropped to get the brand from a registered name ("Razorpay Software Pvt Ltd" → "razorpay").
const GENERIC_WORDS = new Set([
  "technologies", "technology", "tech", "software", "solutions", "services", "systems", "labs", "india",
  "global", "group", "digital", "ventures", "consulting", "and", "the",
]);

/** Likely board names for a company, most specific first (at most 4). */
export function slugCandidates(name) {
  const words = companyKey(name).split(" ").filter(Boolean);
  if (!words.length) return [];
  const brand = words.filter((w) => !GENERIC_WORDS.has(w));
  const out = [words.join(""), words.join("-")];
  if (brand.length && brand.length < words.length) out.push(brand.join(""), brand.join("-"));
  return [...new Set(out)].filter((s) => s.length >= 3).slice(0, 4);
}

export function countScope(jobs) {
  return jobs.filter((j) => isIndiaScope(j.location)).length;
}

/**
 * Find a board for one company. Returns { ats, slug, total, india } for the first board
 * with roles, preferring one with India roles, or null when none is found.
 */
export async function probeCompany(name) {
  let fallback = null;
  for (const slug of slugCandidates(name)) {
    for (const ats of ATS_ORDER) {
      let jobs;
      try {
        jobs = await fetchBoard({ name, ats, slug }, { fresh: true, timeoutMs: PROBE_TIMEOUT_MS });
      } catch {
        continue; // 404 / no such board
      }
      if (!jobs.length) continue;
      const found = { ats, slug, total: jobs.length, india: countScope(jobs) };
      if (found.india > 0) return found;
      fallback ||= found;
    }
  }
  return fallback;
}
