import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRead } from "../src/readCheck.js";

const RAW = `Asha Rao
asha.rao@example.com | +91 98765 43210 | linkedin.com/in/asharao | Bengaluru
Senior Product Manager
Experience
Acme Pay, Product Manager, 2019 - 2023
• Grew monthly active users by 40% across three regions by redesigning onboarding
• Reduced payment failures from 8% to 3% working with engineering and risk teams
Education
IIM Bangalore, MBA, 2017`;

const GOOD = {
  name: "Asha Rao",
  title: "Senior Product Manager",
  contact: "asha.rao@example.com · +91 98765 43210 · linkedin.com/in/asharao · Bengaluru",
  experience: [
    { company: "Acme Pay", role: "Product Manager", period: "2019 - 2023", bullets: [
      "Grew monthly active users by 40% across three regions by redesigning onboarding",
      "Reduced payment failures from 8% to 3% working with engineering and risk teams",
    ] },
  ],
  education: [{ school: "IIM Bangalore", degree: "MBA", period: "2017" }],
};

test("a faithful parse passes", () => {
  const r = checkRead(RAW, GOOD);
  assert.equal(r.ok, true, JSON.stringify(r.missing));
  assert.equal(r.summary, "");
});

test("a lost email, phone and year are reported", () => {
  const bad = { ...GOOD, contact: "Bengaluru", education: [{ school: "IIM Bangalore", degree: "MBA" }] };
  const r = checkRead(RAW, bad);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing.emails, ["asha.rao@example.com"]);
  assert.equal(r.missing.phones.length, 1);
  assert.ok(r.missing.years.includes("2017"));
  assert.match(r.summary, /email/);
});

test("lost figures in a bullet are reported", () => {
  const bad = { ...GOOD, experience: [{ ...GOOD.experience[0], bullets: ["Grew monthly active users across three regions by redesigning onboarding", "Reduced payment failures working with engineering and risk teams"] }] };
  const r = checkRead(RAW, bad);
  assert.equal(r.ok, false);
  assert.ok(r.missing.numbers.some((n) => /40/.test(n)));
});

test("a whole dropped section shows as unplaced lines", () => {
  const raw = `${RAW}\nProjects\nBuilt an internal tool that tracks vendor invoices across several departments\nLed a volunteer programme teaching spreadsheet skills to local school students`;
  const r = checkRead(raw, GOOD);
  assert.equal(r.ok, false);
  assert.ok(r.missing.lines.length >= 2);
});

test("a LinkedIn link kept without https still counts, and rewording a bullet is tolerated", () => {
  const raw = RAW.replace("linkedin.com/in/asharao", "https://www.linkedin.com/in/asharao");
  const reworded = { ...GOOD, experience: [{ ...GOOD.experience[0], bullets: ["Grew monthly active users by 40% in three regions by redesigning onboarding", GOOD.experience[0].bullets[1]] }] };
  assert.equal(checkRead(raw, reworded).ok, true);
});

test("empty input does not throw", () => {
  assert.equal(checkRead("", null).ok, true);
  assert.equal(checkRead("some text here", {}).ok, true);
});
