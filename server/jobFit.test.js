import { test } from "node:test";
import assert from "node:assert/strict";
import { assessJob, candidateProfile, roleFamily, titleLevel } from "../src/jobFit.js";
import { roleSearchWords } from "./jobStore.js";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const pm = {
  title: "Senior Product Manager",
  skills: ["Product strategy", "SQL", "A/B testing", "Roadmap", "Analytics"],
  experience: [{ role: "Senior Product Manager" }, { role: "Product Manager" }],
};
const swe = { title: "Software Engineer", skills: ["Java", "AWS", "Kafka", "SQL"], experience: [{ role: "Software Engineer II" }] };
const job = (role, jd, age = 3) => ({ id: role, role, jd, postedAt: daysAgo(age) });

test("role families and levels from titles", () => {
  assert.equal(roleFamily("Senior Product Manager"), "pm");
  assert.equal(roleFamily("Product Marketing Manager"), "marketing");
  assert.equal(roleFamily("Backend Developer"), "swe");
  assert.equal(titleLevel("VP Product"), 6);
  assert.equal(titleLevel("Associate Product Manager"), 1);
  assert.equal(titleLevel("Senior Software Engineer"), 3);
});

test("a senior PM sees PM roles at their level, ranked above everything else", () => {
  const p = candidateProfile(pm, { roles: ["Senior Product Manager"], years: 9 });
  const good = assessJob(job("Senior Product Manager", "8+ years. SQL, A/B testing, analytics, roadmap."), p, pm);
  assert.equal(good.show, true);
  assert.ok(good.fit >= 75, `fit ${good.fit}`);
  assert.equal(assessJob(job("Senior Software Engineer", "Java AWS 5+ years"), p, pm).reason, "different_role");
  assert.equal(assessJob(job("Associate Product Manager", "0-2 years experience"), p, pm).reason, "too_junior");
  assert.equal(assessJob(job("VP Product", "15+ years experience"), p, pm).reason, "too_senior");
  assert.equal(assessJob(job("Senior Product Manager", "8+ years", 45), p, pm).reason, "stale");
});

test("an engineer is not shown product roles", () => {
  const p = candidateProfile(swe, { roles: ["Software Engineer"], years: 4 });
  assert.equal(assessJob(job("Product Manager", "3-5 years"), p, swe).show, false);
  assert.equal(assessJob(job("Senior Software Engineer - Backend", "Java AWS Kafka 5+ years"), p, swe).show, true);
});

test("saved-roles search drops seniority words", () => {
  assert.deepEqual(roleSearchWords("Senior Product Manager"), ["product", "manager"]);
  assert.deepEqual(roleSearchWords("Lead"), ["lead"]);
});

test("a 4-year engineer is not shown Staff or L1 roles; 3-5+ years has no cap", () => {
  const p = candidateProfile(swe, { roles: ["Software Engineer"], years: 4 });
  assert.equal(assessJob(job("Senior Staff Software Engineer", ""), p, swe).reason, "too_senior");
  assert.equal(assessJob(job("Software Engineer (L1)", ""), p, swe).reason, "too_junior");
  const pmP = candidateProfile(pm, { roles: ["Senior Product Manager"], years: 9 });
  assert.equal(assessJob(job("Senior Product Manager", "3-5+ years of product experience"), pmP, pm).show, true);
});

test("a 9-year PM still sees plain Product Manager roles", () => {
  const p = candidateProfile(pm, { roles: ["Senior Product Manager"], years: 9 });
  assert.equal(assessJob(job("Product Manager, Google Pay", "5+ years"), p, pm).show, true);
  assert.equal(assessJob(job("Technical Product Manager", "8+ years"), p, pm).show, true);
  assert.equal(assessJob(job("Product Manager", "2-4 years"), p, pm).reason, "too_junior");
});

test("career-board roles stay up to 60 days; LinkedIn roles go stale after 30", () => {
  const p = candidateProfile(pm, { roles: ["Senior Product Manager"], years: 9 });
  const old = job("Senior Product Manager", "8+ years", 45);
  assert.equal(assessJob({ ...old, source: "greenhouse" }, p, pm).show, true);
  assert.equal(assessJob({ ...old, source: "linkedin" }, p, pm).reason, "stale");
});
