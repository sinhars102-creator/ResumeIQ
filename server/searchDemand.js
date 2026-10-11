/**
 * Demand-driven LinkedIn collection: searches users ask for are recorded, served from the
 * jobs repository while fresh, and refreshed by the daily collector for a while after.
 */

/** A search's results from the repository are reused for this long before LinkedIn is searched again. */
export const FRESH_HOURS = 24;
/** The daily collector keeps refreshing a search for this many days after someone last asked for it. */
export const DEMAND_DAYS = 14;

// Common abbreviations, so "Sr PM" and "Senior Product Manager" are one search.
const EXPANSIONS = {
  sr: "senior", snr: "senior", jr: "junior", mgr: "manager", eng: "engineer", engg: "engineer",
  pm: "product manager", apm: "associate product manager", gpm: "group product manager",
  swe: "software engineer", sde: "software development engineer", vp: "vice president",
};
const FILLER = new Set(["job", "jobs", "role", "roles", "position", "positions", "opening", "openings", "in", "india"]);

/** Normalised form of a search, used as its key: lower case, abbreviations expanded, filler dropped. */
export function normalizeQuery(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean)
    .flatMap((t) => (EXPANSIONS[t] || t).split(" "))
    .filter((t) => !FILLER.has(t))
    .join(" ");
}
