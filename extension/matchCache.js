// Fit scores per job, kept in the browser for a week: shared by the side panel and the match card
// on LinkedIn job pages (via background.js), so both show the same score without asking twice.

const MATCH_CACHE_DAYS = 7;
const MATCHES_KEY = "matches-v2"; // scores from the website's scorer (v1 used a different one)

/** One key per role: LinkedIn's job id, else the page address without its query. */
export function jobKey(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("linkedin.com")) {
      const id = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/)?.[1] || u.searchParams.get("currentJobId");
      if (id) return `linkedin:${id}`;
    }
    return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function cachedMatch(key) {
  const { [MATCHES_KEY]: matches = {} } = await chrome.storage.local.get(MATCHES_KEY);
  const hit = matches[key];
  return hit && Date.now() - hit.at < MATCH_CACHE_DAYS * 864e5 ? hit.match : null;
}

export async function cacheMatch(key, match) {
  const { [MATCHES_KEY]: matches = {} } = await chrome.storage.local.get(MATCHES_KEY);
  matches[key] = { at: Date.now(), match };
  // Keep the newest 300.
  const keep = Object.entries(matches).sort((a, b) => b[1].at - a[1].at).slice(0, 300);
  await chrome.storage.local.set({ [MATCHES_KEY]: Object.fromEntries(keep) });
}
