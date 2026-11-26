import { test } from "node:test";
import assert from "node:assert/strict";
import { claimContext, unsupportedClaims, cleanEdit } from "./tailorChat.js";

const RESUME = {
  name: "Asha Rao",
  title: "Product Manager",
  contact: "asha@example.com · Bengaluru",
  summary: "Product manager with five years in logistics.",
  experience: [{ company: "Acme", role: "PM", period: "2019-2023", bullets: ["Grew monthly active users by 40% across three regions"] }],
  skills: ["SQL", "Roadmapping"],
  certifications: [],
  education: [],
};
const JD = `Amazon's team builds powered tools for optimal delivery planning. You will work with Engineers across 100+ sites.
We use Kafka and SAP, and apply clustering to route demand. Strong stakeholder skills are a plus.`;

const ctx = (userText = "") => claimContext(RESUME, JD, userText, {});

test("ordinary job words the candidate didn't say are not treated as claims", () => {
  const bad = unsupportedClaims("Worked with engineers on powered tooling for optimal delivery across 100+ sites", ctx());
  assert.deepEqual(bad, []);
});

test("skill-type job words the candidate didn't claim still are", () => {
  assert.deepEqual(unsupportedClaims("Applied clustering to route demand", ctx()), ["clustering"]);
  assert.ok(unsupportedClaims("Built pipelines on Kafka", ctx()).includes("kafka"));
  assert.ok(unsupportedClaims("Managed SAP reports", ctx()).includes("sap"));
});

test("a skill the candidate says in the chat counts as claimed", () => {
  assert.deepEqual(unsupportedClaims("Applied clustering to route demand", ctx("I used clustering for demand routing at Acme")), []);
});

test("without a job description every new word still needs to come from the candidate (strict)", () => {
  const strict = claimContext(RESUME, "", "", { strict: true });
  assert.ok(unsupportedClaims("Pioneered a revolutionary warehouse programme", strict).length > 0);
});

test("a word already on the resume is never flagged", () => {
  assert.deepEqual(unsupportedClaims("Used SQL for roadmapping", ctx()), []);
});

test("short skills (Go, R, C#, AI, ML, K8s) need evidence like any other skill", () => {
  const c = claimContext(RESUME, "Need Go, R, C#, AI, ML and K8s experience", "");
  for (const skill of ["Go", "R", "C#", "AI", "ML", "K8s"]) {
    const out = cleanEdit({ target: "K", op: "add_skills", skills: [skill] }, RESUME, c);
    assert.deepEqual(out, { unsupported: [skill] }, skill);
  }
});

test("a short skill the resume or the chat shows is accepted", () => {
  const withGo = { ...RESUME, skills: ["SQL", "Go"] };
  assert.equal(cleanEdit({ target: "K", op: "add_skills", skills: ["Go", "Tableau"] }, withGo, claimContext(withGo, "", "I use Tableau at work")).skills.join(), "Tableau");
  const chat = claimContext(RESUME, "", "I wrote services in Go and C# at Acme");
  assert.deepEqual(cleanEdit({ target: "K", op: "add_skills", skills: ["Go", "C#"] }, RESUME, chat).skills, ["Go", "C#"]);
});

test("a rewrite that brings in a short job skill is stopped, ordinary wording is not", () => {
  const c = claimContext(RESUME, "Need C# and Go experience. R&D background a plus.", "");
  assert.ok(unsupportedClaims("Built services in C# and Go", c).length >= 2);
  assert.deepEqual(unsupportedClaims("Went to market with a go-to-market plan for R&D tools", c), []);
});

test("a title or summary may not gain seniority the resume never showed", () => {
  const c = claimContext(RESUME, "Senior Product Manager wanted", "");
  assert.deepEqual(cleanEdit({ target: "T", op: "replace", after: "Senior Product Manager" }, RESUME, c), { unsupported: ["senior"] });
  assert.ok(cleanEdit({ target: "T", op: "replace", after: "Product Manager, Logistics" }, RESUME, c).after);
  assert.ok(cleanEdit({ target: "T", op: "replace", after: "Senior Product Manager" }, RESUME, claimContext(RESUME, "", "I was promoted to senior PM")).after);
});

test("seniority and short-skill checks don't block ordinary wording", () => {
  const c = claimContext(RESUME, "Go beyond the brief. Need Go and 5 ml of ML knowledge. Lead generation a plus.", "");
  const t = (after) => cleanEdit({ target: "T", op: "replace", after }, RESUME, c);
  assert.ok(t("Product Manager, Lead Generation").after);
  assert.deepEqual(t("Lead Product Manager"), { unsupported: ["lead"] });
  const s = cleanEdit({ target: "S", op: "replace", after: "Product manager who can lead cross-functional teams across logistics." }, RESUME, c);
  assert.ok(s.after);
  assert.deepEqual(unsupportedClaims("Go beyond expectations on 5 ml dosing", c), []);
  assert.ok(unsupportedClaims("Built services in Go", c).includes("go"));
});
