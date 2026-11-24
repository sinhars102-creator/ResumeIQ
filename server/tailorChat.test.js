import { test } from "node:test";
import assert from "node:assert/strict";
import { claimContext, unsupportedClaims } from "./tailorChat.js";

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
