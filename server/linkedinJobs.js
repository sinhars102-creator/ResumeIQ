/**
 * LinkedIn roles via Apify actors, normalised to ResumeIQ's job shape.
 * Used by the live search in server/index.js and by the jobs collector (server/collectJobs.js).
 */
import * as cheerio from "cheerio";

/** Strip HTML to plain text. */
export function htmlToText(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  try {
    const $ = cheerio.load(html);
    return $.text().replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/** Get job description from raw object (multiple possible keys, strip HTML). */
function getJd(raw) {
  const candidates = [
    raw.description,
    raw.jobDescription,
    raw.jd,
    raw.jobDescriptionText,
    raw.fullDescription,
    raw.snippet,
    raw.content,
    raw.body,
    raw.details?.description,
    raw.jobData?.description,
    raw.descriptionHtml,
    raw.jobDescriptionHtml,
  ].filter(Boolean);
  for (const v of candidates) {
    const str = typeof v === "string" ? v : (v && typeof v === "object" && (v.text ?? v.content) ? (v.text ?? v.content) : "");
    if (typeof str === "string" && str.trim().length > 0) {
      return /<[a-z][\s\S]*>/i.test(str) ? htmlToText(str) : str.trim();
    }
  }
  // Fallback: longest string value that looks like prose (likely the JD)
  if (raw && typeof raw === "object") {
    let best = "";
    for (const value of Object.values(raw)) {
      const s = typeof value === "string" ? value : (value?.text ?? value?.content);
      if (typeof s === "string" && s.length > best.length && s.length > 80 && /\s/.test(s)) {
        best = /<[a-z][\s\S]*>/i.test(s) ? htmlToText(s) : s.trim();
      }
    }
    if (best) return best;
  }
  return "";
}

/** Normalize third-party job shape to ResumeIQ job shape (RapidAPI + Apify).
 * practicaltools/linkedin-jobs returns: jobId, title, company, location, datePosted, url, labels, logo, extractedAt, source, discoveredAt — no description field. */
export function normalizeJob(raw, index) {
  const id = raw.jobId ?? raw.id ?? raw.urn ?? raw.link?.match(/-(\d+)\?/)?.[1] ?? `linkedin-${index}-${Date.now()}`;
  const company =
    (typeof raw.company === "string" ? raw.company : null) ??
    raw.company?.name ??
    raw.companyName ??
    raw.employer ??
    raw.organization ??
    (typeof raw.company === "object" && raw.company !== null ? raw.company.name || raw.company.title : null) ??
    "Company";
  const locationStr =
    (typeof raw.location === "string" ? raw.location : null) ??
    raw.locationName ??
    raw.place ??
    raw.jobLocation ??
    (raw.locationDetails ? [raw.locationDetails.city, raw.locationDetails.country].filter(Boolean).join(", ") : "") ??
    "";
  const jd = getJd(raw);
  const salary = raw.salary ?? raw.compensation ?? (raw.salaryInfo?.raw ?? "") ?? raw.salaryRange ?? "";
  const role =
    raw.title ??
    raw.jobTitle ??
    raw.position ??
    raw.positionTitle ??
    raw.name ??
    "Role";
  return {
    id: String(id).replace(/\s/g, "-"),
    company: typeof company === "string" ? company : "Company",
    role: typeof role === "string" ? role : "Role",
    location: locationStr || "",
    salary: salary || "",
    badge: raw.badge ?? null,
    source: "linkedin",
    jd: jd || "",
    url: raw.url ?? raw.jobUrl ?? raw.link ?? "",
  };
}

/** Fetch jobs via Apify LinkedIn Jobs Scraper. Returns { jobs } or { error: string } on failure. */
export async function fetchJobsApify(token, keywords, location, limit, experienceLevels = []) {
  const requested = Math.min(Number(limit) || 25, 150);
  const maxPages = Math.min(Math.ceil(requested / 10), 15); // 10 jobs per page, cap 15 pages (150 jobs)
  const url = `https://api.apify.com/v2/acts/practicaltools~linkedin-jobs/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=180&format=json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      keywords: keywords || "Product Manager",
      location: location || "India",
      maxPages,
      maxRequestsPerCrawl: Math.min(maxPages * 12, 200),
      ...(experienceLevels.length ? { experienceLevel: experienceLevels } : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.slice(0, 200);
    try {
      const err = JSON.parse(text);
      if (err.error && err.error.message) detail = err.error.message;
      else if (err.message) detail = err.message;
    } catch (_) {}
    console.error("[linkedin-jobs] Apify error", response.status, detail);
    return { error: `Apify ${response.status}: ${detail}` };
  }
  let rawList;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && typeof parsed === "object") {
      rawList = parsed.data ?? parsed.items ?? parsed.results ?? parsed.jobs ?? (parsed.content && Array.isArray(parsed.content) ? parsed.content : null);
      if (!Array.isArray(rawList)) {
        const keys = Object.keys(parsed).join(", ");
        console.warn("[linkedin-jobs] Apify response not an array, top-level keys:", keys);
        return { jobs: [] };
      }
    } else {
      rawList = [];
    }
  } catch {
    console.error("[linkedin-jobs] Apify response not valid JSON");
    return { error: "Apify returned invalid JSON" };
  }
  if (!Array.isArray(rawList) || rawList.length === 0) {
    console.log("[linkedin-jobs] Apify – no items in response");
    return { jobs: [] };
  }
  // Apify practicaltools/linkedin-jobs returns items like { scrapedAt, total, jobs: [...] }. Flatten.
  const flatRaw = [];
  for (const item of rawList) {
    if (item && typeof item === "object" && Array.isArray(item.jobs)) {
      flatRaw.push(...item.jobs);
    } else if (item && typeof item === "object" && (item.title || item.jobTitle || item.company || item.companyName)) {
      flatRaw.push(item);
    }
  }
  const toNormalize = flatRaw.length ? flatRaw : rawList;
  if (toNormalize.length > 0 && toNormalize[0] && typeof toNormalize[0] === "object") {
    const first = toNormalize[0];
    console.log("[linkedin-jobs] Apify job keys:", Object.keys(first).join(", "));
    const firstNormalized = normalizeJob(first, 0);
    console.log("[linkedin-jobs] Apify first job JD length:", firstNormalized.jd?.length ?? 0);
    if (!firstNormalized.jd && first && typeof first === "object") {
      const descKeys = ["description", "jobDescription", "jd", "snippet", "content", "body", "fullDescription", "jobDescriptionText"];
      const found = descKeys.find((k) => first[k] && typeof first[k] === "string");
      console.log("[linkedin-jobs] JD missing – checked keys present:", found ? found : "none (actor may not return full descriptions in list output)");
    }
  }
  const jobs = toNormalize.map((raw, i) => normalizeJob(raw, i));
  console.log("[linkedin-jobs] Apify 200 – jobs count:", jobs.length);
  return { jobs };
}

/** Fetch jobs with full JDs using Valig LinkedIn Jobs Scraper (returns description in one call). */
export async function fetchJobsValig(token, keywords, location, limit, experienceLevels = []) {
  const reqLimit = Math.min(Number(limit) || 50, 100);
  const url = `https://api.apify.com/v2/acts/valig~linkedin-jobs-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=180&format=json`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({
      keywords: keywords || "Product Manager",
      location: location || "India",
      limit: reqLimit,
      ...(experienceLevels.length ? { urlParam: [{ key: "f_E", value: experienceLevels.join(",") }] } : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    console.warn("[linkedin-jobs] Valig Apify error", response.status, text.slice(0, 200));
    return null;
  }
  let rawList = [];
  try {
    const parsed = JSON.parse(text);
    rawList = Array.isArray(parsed) ? parsed : parsed?.data ?? parsed?.items ?? [];
  } catch {
    return null;
  }
  if (rawList.length === 0) return null;
  const jobs = rawList.map((raw, i) => normalizeJob(raw, i));
  console.log("[linkedin-jobs] Valig 200 – jobs count:", jobs.length, "with JDs");
  return { jobs };
}
