/**
 * Apify "All Jobs Scraper" (agentx/all-jobs-scraper) results → ResumeIQ job shape.
 * Used for job sites with no public API of their own, starting with Naukri and Glassdoor.
 * Tested 2026-10-06: Naukri and Glassdoor relevant; Indeed returned recruiter spam and
 * foundit returned nothing for India, so they are left out.
 */
export const ALL_JOBS_PLATFORMS = { "Naukri.com": "naukri", Glassdoor: "glassdoor" };

/** The listing's id at its site, from its URL (Naukri: trailing number; Glassdoor: jl=). */
export function allJobsListingId(item) {
  const url = String(item.platform_url || "");
  if (item.platform === "Naukri.com") return url.match(/-(\d{6,})(?:[?#]|$)/)?.[1] || null;
  if (item.platform === "Glassdoor") return url.match(/[?&]jl=(\d+)/)?.[1] || null;
  return null;
}

function salaryText(item) {
  const { salary_minimum: min, salary_maximum: max, salary_currency: cur, salary_period: period } = item;
  if (!min && !max) return "";
  const fmt = (n) => Number(n).toLocaleString("en-IN");
  const range = min && max && min !== max ? `${fmt(min)}–${fmt(max)}` : fmt(min || max);
  return [cur, range, period ? `per ${period}` : ""].filter(Boolean).join(" ");
}

/** One scraper item → ResumeIQ job, or null for platforms we don't take or items without an id. */
export function normalizeAllJobsItem(item) {
  const source = ALL_JOBS_PLATFORMS[item?.platform];
  const listingId = source && allJobsListingId(item);
  if (!listingId) return null;
  return {
    id: `${source}-${listingId}`,
    company: item.company_name || "Company",
    role: item.title || "Role",
    location: item.location?.raw || "",
    salary: salaryText(item),
    badge: null,
    source,
    jd: item.description || "",
    url: item.platform_url || "",
    postedAt: item.posted_date || null,
  };
}
