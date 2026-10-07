// Tests for server/jobSources.js. Run with: npm test
// Network calls are replaced with sample responses shaped like each API's documented output.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  htmlToPlain,
  formatLpa,
  isIndiaLocation,
  titleMatches,
  dedupeJobs,
  normalizeGreenhouse,
  normalizeLever,
  normalizeAshby,
  normalizeWorkable,
  normalizeAdzuna,
  searchCompanyBoards,
  searchAdzuna,
  searchApiSources,
} from "./jobSources.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.ADZUNA_APP_ID;
  delete process.env.ADZUNA_APP_KEY;
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* Sample payloads (trimmed to the fields ResumeIQ reads) */
const GREENHOUSE = {
  jobs: [
    {
      id: 7814498003,
      title: "Senior Product Manager, Growth",
      updated_at: "2026-10-01T10:00:00-04:00",
      first_published: "2026-09-28T09:00:00-04:00",
      location: { name: "Bengaluru, Karnataka" },
      absolute_url: "https://job-boards.greenhouse.io/postman/jobs/7814498003",
      content: "&lt;p&gt;You will own &lt;strong&gt;activation&lt;/strong&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;5+ years in product&lt;/li&gt;&lt;/ul&gt;",
    },
    { id: 2, title: "Product Manager", location: { name: "San Francisco, CA" }, absolute_url: "x", content: "" },
    { id: 3, title: "Software Engineer", location: { name: "Bengaluru" }, absolute_url: "x", content: "" },
  ],
  meta: { total: 3 },
};
const LEVER = [
  {
    id: "bc1060ed-d15a-4f62-a560-856cc344201e",
    text: "Product Manager",
    hostedUrl: "https://jobs.lever.co/fampay/bc1060ed",
    createdAt: 1759300000000,
    categories: { location: "Bengaluru", team: "Product", commitment: "Full-time", allLocations: ["Bengaluru"] },
    descriptionPlain: "Fam is building payments for young India.",
    lists: [{ text: "What you'll do", content: "<li>Own the UPI roadmap</li><li>Ship weekly</li>" }],
    additionalPlain: "Hybrid, 3 days in office.",
    salaryRange: { currency: "INR", interval: "per-year-salary", min: 3000000, max: 4500000 },
  },
];
const ASHBY = {
  jobs: [
    {
      id: "6f88d5de",
      title: "Senior Product Manager",
      location: "Bengaluru, India",
      secondaryLocations: [{ location: "Remote - India" }],
      isListed: true,
      isRemote: false,
      publishedAt: "2026-09-30T00:00:00.000Z",
      jobUrl: "https://jobs.ashbyhq.com/josys/6f88d5de",
      descriptionPlain: "Lead the SaaS management product.",
      compensation: { compensationTierSummary: "₹40L – ₹55L" },
    },
    { id: "hidden", title: "Product Manager", location: "Bengaluru", isListed: false, jobUrl: "x" },
  ],
};
const WORKABLE = {
  name: "Elevation Capital",
  jobs: [
    {
      title: "Product Manager - Portfolio",
      shortcode: "ABC123",
      url: "https://apply.workable.com/elevation-capital-3/j/ABC123/",
      published_on: "2026-09-29",
      locations: [{ city: "Gurugram", region: "Haryana", country: "India", countryCode: "IN" }],
      description: "<p>Work with a portfolio company.</p>",
    },
  ],
};
const ADZUNA = {
  count: 2,
  results: [
    {
      id: "4911024925",
      title: "<strong>Product</strong> Manager",
      description: "Drive roadmap for a consumer fintech app…",
      created: "2026-10-02T08:00:00Z",
      redirect_url: "https://www.adzuna.in/details/4911024925",
      company: { display_name: "Kirana Cloud" },
      location: { display_name: "Gurgaon, Haryana" },
      salary_min: 2400000,
      salary_max: 3000000,
      salary_is_predicted: "0",
    },
    {
      id: "2",
      title: "Product Manager",
      description: "short",
      redirect_url: "https://www.adzuna.in/details/2",
      company: { display_name: "Zestly" },
      location: { display_name: "Mumbai" },
      salary_min: 1000000,
      salary_max: 1000000,
      salary_is_predicted: "1",
    },
  ],
};

test("htmlToPlain decodes Greenhouse's escaped HTML and keeps list structure", () => {
  const text = htmlToPlain(GREENHOUSE.jobs[0].content);
  assert.match(text, /You will own activation\./);
  assert.match(text, /• 5\+ years in product/);
  assert.doesNotMatch(text, /<|&lt;/);
});

test("formatLpa formats INR ranges", () => {
  assert.equal(formatLpa(3000000, 4500000), "₹30–45 LPA");
  assert.equal(formatLpa(850000, 850000), "₹8.5 LPA");
  assert.equal(formatLpa(null, undefined), "");
});

test("isIndiaLocation recognises Indian cities and India-friendly remote roles", () => {
  assert.ok(isIndiaLocation("Bengaluru, Karnataka"));
  assert.ok(isIndiaLocation("Gurgaon"));
  assert.ok(isIndiaLocation("Remote"));
  assert.ok(!isIndiaLocation("Remote - US"));
  assert.ok(!isIndiaLocation("San Francisco, CA"));
  assert.ok(!isIndiaLocation("Remote", { allowRemote: false }));
});

test("titleMatches requires every keyword, ignores seniority words", () => {
  assert.ok(titleMatches("Senior Product Manager, Growth", "Product Manager"));
  assert.ok(titleMatches("Group PM", "product manager"));
  assert.ok(!titleMatches("Product Designer", "Product Manager"));
  assert.ok(titleMatches("Anything", ""));
});

test("titleMatches reads leadership searches as a level and skips other functions", () => {
  assert.ok(titleMatches("Director - Product", "Product Leader"));
  assert.ok(titleMatches("Group Product Manager (Manager Effectiveness)", "Product Leader"));
  assert.ok(titleMatches("Principal Product Manager", "Product Leader"));
  assert.ok(titleMatches("Head of Product", "Product Leader"));
  assert.ok(!titleMatches("Senior Product Manager", "Product Leader"));
  assert.ok(!titleMatches("Lead Product Designer", "Product Leader"));
  assert.ok(!titleMatches("Director of Product Design", "Product Leader"));
  assert.ok(!titleMatches("VP Engineering", "Product Leader"));
  assert.ok(!titleMatches("Product Marketing Manager", "Product Manager"));
  assert.ok(!titleMatches("Senior Manager - Production", "Product Manager"));
  assert.ok(titleMatches("Senior Product Designer", "Product Designer"));
  assert.ok(titleMatches("Engineering Manager, Payments", "Engineering Manager"));
});

test("normalizers map each API to ResumeIQ's job shape", () => {
  const gh = normalizeGreenhouse(GREENHOUSE.jobs[0], { name: "Postman", slug: "postman" });
  assert.equal(gh.id, "gh-postman-7814498003");
  assert.equal(gh.source, "greenhouse");
  assert.equal(gh.location, "Bengaluru, Karnataka");
  assert.match(gh.jd, /activation/);

  const lv = normalizeLever(LEVER[0], { name: "Fam", slug: "fampay" });
  assert.equal(lv.id, "lever-fampay-bc1060ed-d15a-4f62-a560-856cc344201e");
  assert.equal(lv.salary, "₹30–45 LPA");
  assert.match(lv.jd, /What you'll do\n• Own the UPI roadmap/);
  assert.match(lv.jd, /Hybrid, 3 days/);

  const ab = normalizeAshby(ASHBY.jobs[0], { name: "Josys", slug: "josys" });
  assert.equal(ab.location, "Bengaluru, India, Remote - India");
  assert.equal(ab.salary, "₹40L – ₹55L");

  const wk = normalizeWorkable(WORKABLE.jobs[0], { name: "Elevation Capital", slug: "elevation-capital-3" });
  assert.equal(wk.id, "workable-elevation-capital-3-ABC123");
  assert.equal(wk.location, "Gurugram, Haryana, India");
  assert.equal(wk.jd, "Work with a portfolio company.");

  const az = normalizeAdzuna(ADZUNA.results[0]);
  assert.equal(az.role, "Product Manager");
  assert.equal(az.salary, "₹24–30 LPA");
  assert.equal(normalizeAdzuna(ADZUNA.results[1]).salary, "", "predicted salaries are hidden");
});

test("dedupeJobs keeps one card per company+role+city, preferring the longer JD", () => {
  const jobs = dedupeJobs([
    { id: "a", company: "Postman", role: "Senior Product Manager", location: "Bengaluru", jd: "short" },
    { id: "b", company: "postman", role: "Senior Product Manager", location: "Bengaluru, Karnataka", jd: "a much longer description" },
    { id: "c", company: "Postman", role: "Product Designer", location: "Bengaluru", jd: "" },
  ]);
  assert.equal(jobs.length, 2);
  assert.equal(jobs.find((j) => j.role === "Senior Product Manager").id, "b");
});

test("searchCompanyBoards filters by title and India, and survives a broken board", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("greenhouse.io/v1/boards/postman")) return json(GREENHOUSE);
    if (u.includes("api.lever.co/v0/postings/fampay")) return json(LEVER);
    if (u.includes("ashbyhq.com/posting-api/job-board/josys")) return json(ASHBY);
    if (u.includes("workable.com/api/v1/widget/accounts/elevation-capital-3")) return json(WORKABLE);
    return json({ error: "not found" }, 404);
  };
  const companies = [
    { name: "Postman", ats: "greenhouse", slug: "postman" },
    { name: "Fam", ats: "lever", slug: "fampay" },
    { name: "Josys", ats: "ashby", slug: "josys" },
    { name: "Elevation Capital", ats: "workable", slug: "elevation-capital-3" },
    { name: "Gone Inc", ats: "lever", slug: "gone-inc" },
  ];
  const { jobs, stats } = await searchCompanyBoards({ keywords: "Product Manager", companies });
  const titles = jobs.map((j) => `${j.company}: ${j.role}`).sort();
  assert.deepEqual(titles, [
    "Elevation Capital: Product Manager - Portfolio",
    "Fam: Product Manager",
    "Josys: Senior Product Manager",
    "Postman: Senior Product Manager, Growth",
  ]);
  assert.equal(stats.ok, 4);
  assert.equal(stats.failed.length, 1);
});

test("searchAdzuna is off without keys and calls the India endpoint with keys", async () => {
  assert.deepEqual(await searchAdzuna({ keywords: "product manager" }), []);
  process.env.ADZUNA_APP_ID = "id";
  process.env.ADZUNA_APP_KEY = "key";
  let called = "";
  globalThis.fetch = async (url) => {
    called = String(url);
    return json(ADZUNA);
  };
  const jobs = await searchAdzuna({ keywords: "product manager", location: "India", limit: 50 });
  assert.match(called, /api\.adzuna\.com\/v1\/api\/jobs\/in\/search\/1\?/);
  assert.match(called, /what=product\+manager/);
  assert.doesNotMatch(called, /where=/, "no 'where' for an all-India search");
  assert.equal(jobs.length, 2);
});

test("searchApiSources combines sources, newest first", async () => {
  process.env.ADZUNA_APP_ID = "id";
  process.env.ADZUNA_APP_KEY = "key";
  globalThis.fetch = async (url) => (String(url).includes("adzuna") ? json(ADZUNA) : json({ error: "nf" }, 404));
  const { jobs, sources } = await searchApiSources({ keywords: "Product Manager", location: "India" });
  assert.equal(sources.adzuna.found, 2);
  assert.equal(jobs[0].id, "adzuna-4911024925", "dated job sorts before undated");
});

test("jobs repository rows keep the source, its own id and link", async () => {
  const { toRow, sourceJobId } = await import("./jobStore.js");
  const lever = { id: "lever-fampay-bc10", source: "lever", company: "Fam", role: "Senior PM", location: "Bengaluru", url: "https://jobs.lever.co/fampay/bc10", jd: "Own UPI" };
  const row = toRow(lever, { board: "fampay", seenAt: "2026-10-06T00:00:00Z" });
  assert.equal(row.id, "lever:bc10");
  assert.equal(row.source_job_id, "bc10");
  assert.equal(row.source_board, "fampay");
  assert.equal(row.source_url, "https://jobs.lever.co/fampay/bc10");
  assert.equal(row.is_india, true);
  assert.equal(row.last_seen_at, "2026-10-06T00:00:00Z");
  assert.deepEqual(row.source_query, []);

  const li = toRow({ id: "4012345678", source: "linkedin", company: "Acme", role: "PM", location: "Remote - Estonia" }, { query: "Product Manager" });
  assert.equal(li.id, "linkedin:4012345678");
  assert.equal(li.is_india, false);
  assert.deepEqual(li.source_query, ["Product Manager"]);

  assert.equal(sourceJobId({ id: "gh-truecaller-77", source: "greenhouse" }, "truecaller"), "77");
  assert.equal(sourceJobId({ id: "adzuna-55", source: "adzuna" }), "55");
});

test("India-only scope keeps India and country-less remote roles", async () => {
  const { isRemoteAnywhere } = await import("./jobSources.js");
  const { toRow, inScope } = await import("./jobStore.js");
  assert.ok(isRemoteAnywhere("Remote"));
  assert.ok(isRemoteAnywhere("Remote - Anywhere"));
  assert.ok(!isRemoteAnywhere("Remote - Estonia"));
  assert.ok(!isRemoteAnywhere("Remote-Friendly (Travel-Required) | Washington, DC"));
  const row = (location) => toRow({ id: "1", source: "linkedin", company: "A", role: "PM", location });
  assert.ok(inScope(row("Bengaluru, Karnataka")));
  assert.ok(inScope(row("Remote")));
  assert.ok(!inScope(row("Remote - Estonia")));
  assert.ok(!inScope(row("San Francisco, CA")));
});

test("board name guesses come from the brand in a registered name", async () => {
  const { slugCandidates } = await import("./companyDiscovery.js");
  assert.deepEqual(slugCandidates("Razorpay Software Pvt Ltd"), ["razorpaysoftware", "razorpay-software", "razorpay"]);
  assert.deepEqual(slugCandidates("Yellow.ai"), ["yellowai", "yellow-ai"]);
  assert.deepEqual(slugCandidates(""), []);
});

test("searches are grouped by a normalised key", async () => {
  const { normalizeQuery } = await import("./searchDemand.js");
  assert.equal(normalizeQuery("Sr PM"), "senior product manager");
  assert.equal(normalizeQuery("  Senior Product Manager jobs in India "), "senior product manager");
  assert.equal(normalizeQuery("Data Analyst"), "data analyst");
  assert.equal(normalizeQuery(""), "");
});

test("All Jobs Scraper items map to Naukri and Glassdoor roles", async () => {
  const { normalizeAllJobsItem } = await import("./allJobsScraper.js");
  const naukri = normalizeAllJobsItem({
    platform: "Naukri.com", title: "Product Manager", company_name: "Niyo Solutions",
    location: { raw: "Bengaluru" }, description: "Own the roadmap",
    platform_url: "https://www.naukri.com/job-listings-product-manager-niyo-solutions-bengaluru-2-to-7-years-061026504587",
  });
  assert.equal(naukri.id, "naukri-061026504587");
  assert.equal(naukri.source, "naukri");
  assert.equal(naukri.location, "Bengaluru");
  const gd = normalizeAllJobsItem({ platform: "Glassdoor", title: "PM", platform_url: "https://www.glassdoor.co.in/job-listing/j?jl=1010274301068", salary_minimum: 1500000, salary_maximum: 2500000, salary_currency: "INR", salary_period: "year" });
  assert.equal(gd.id, "glassdoor-1010274301068");
  assert.equal(gd.salary, "INR 15,00,000–25,00,000 per year");
  assert.equal(normalizeAllJobsItem({ platform: "Indeed", platform_url: "https://in.indeed.com/viewjob?jk=1" }), null);
});

test("Easy Apply fill: rules from profile, never diversity or acknowledgements", async () => {
  const { fillForm, questionKey } = await import("./easyApplyFill.js");
  const fields = [
    { id: "first_name", label: "First Name", type: "text", required: true, section: "application" },
    { id: "email", label: "Email", type: "email", required: true, section: "application" },
    { id: "q1", label: "Are you legally authorized to work in India?", type: "select", required: true, section: "application", options: [{ value: "1", label: "Yes" }, { value: "0", label: "No" }] },
    { id: "q2", label: "Will you require sponsorship?", type: "select", required: true, section: "application", options: [{ value: "a", label: "Yes" }, { value: "b", label: "No" }] },
    { id: "q3", label: "Gender:", type: "select", required: false, section: "application", options: [{ value: "m", label: "Male" }] },
    { id: "q4", label: "Candidate Privacy Policy", type: "select", required: true, section: "application", options: [{ value: "y", label: "I acknowledge" }] },
    { id: "q5", label: "How did you hear about us?", type: "select", required: true, section: "application", options: [{ value: "li", label: "LinkedIn" }] },
  ];
  const profile = { first_name: "Asha", email: "asha@example.com", needs_sponsorship: false, saved_answers: { [questionKey("How did you hear about us?")]: "li" } };
  const { answers, needsYou } = await fillForm({ fields, profile });
  assert.equal(answers.first_name.value, "Asha");
  assert.equal(answers.email.value, "asha@example.com");
  assert.equal(answers.q1.value, "1");
  assert.equal(answers.q2.value, "b");
  assert.equal(answers.q5.source, "saved");
  assert.ok(!answers.q3 && needsYou.some((n) => n.id === "q3"));
  assert.ok(!answers.q4 && needsYou.some((n) => n.id === "q4"));
});
