// Checks every company board in server/jobBoards.js and prints which respond and how many
// roles each has (total and in India). Run from the project root:  npm run check-sources
import { loadCompanies, fetchBoard, isIndiaLocation, adzunaConfigured, searchAdzuna } from "../server/jobSources.js";

const companies = loadCompanies();
console.log(`Checking ${companies.length} career boards…\n`);

const rows = [];
for (const company of companies) {
  try {
    const jobs = await fetchBoard(company, { fresh: true });
    const india = jobs.filter((j) => isIndiaLocation(j.location)).length;
    rows.push({ ok: true, company, total: jobs.length, india });
    console.log(`  ✓ ${company.name.padEnd(34)} ${company.ats.padEnd(10)} ${String(jobs.length).padStart(4)} roles, ${india} in India/remote`);
  } catch (e) {
    rows.push({ ok: false, company, error: e.message });
    console.log(`  ✗ ${company.name.padEnd(34)} ${company.ats.padEnd(10)} ${e.name === "AbortError" ? "timeout" : e.message}  → set enabled: false or fix the slug`);
  }
}

const ok = rows.filter((r) => r.ok);
console.log(`\n${ok.length}/${rows.length} boards OK · ${ok.reduce((n, r) => n + r.india, 0)} roles in India/remote across them`);

if (adzunaConfigured()) {
  const jobs = await searchAdzuna({ keywords: "product manager", limit: 50 });
  console.log(`Adzuna India: ${jobs.length} "product manager" roles returned`);
} else {
  console.log("Adzuna India: not configured (set ADZUNA_APP_ID and ADZUNA_APP_KEY in .env)");
}
