import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import fs from "node:fs";
import { chromium } from "playwright-core";
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), scrollTo() {} };
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { default: W } = await server.ssrLoadModule("/src/ResumeWorkspace.jsx");
const resume = {
  name: "Rahul Sinha", title: "Senior PM", contact: "r@x.com", summary: "Nine years.",
  experience: [{ role: "Manager", company: "Blinkit", period: "2015", bullets: ["Built it with a long line that wraps onto a second line to check the alignment of the buttons beside it", "Scaled it"] }],
  education: [{ degree: "B. Tech", school: "Manipal Institute of Technology", year: "", grade: "9.92/10 (final semester)", details: ["Engineering 2012 to 2016"] }, { degree: "MBA", school: "IIM Ahmedabad", year: "2028" }],
  skills: ["SQL"], certifications: ["PMP"],
};
const props = { resume, suggestions: {}, title: "Editing your resume", subtitle: "", score: { label: "Strength", now: 60, base: 50, potential: 80, unit: "" }, busy: false, status: "", blankValues: {}, setBlankValues() {}, flash: null, deltaOf: () => 0, keywordsOf: () => [], act: {}, canUndo: false, canRedo: false, thread: [] };
const body = renderToString(React.createElement(W, props));
const css = fs.readFileSync("src/index.css", "utf8") + fs.readFileSync("src/ResumeLLM.css", "utf8");
fs.writeFileSync("qa/shot.html", `<!doctype html><meta charset=utf-8><style>${css}</style><body>${body}</body>`);
await server.close();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto("file://" + process.cwd() + "/qa/shot.html");
const sec = page.locator('[data-section="education"]');
await sec.locator('[data-line="D1"]').hover();
await sec.screenshot({ path: process.env.OUT || "qa/shot-education.png" });
const exp = page.locator('[data-section="experience"] [data-line="E0B0"]');
await exp.hover();
await page.locator('[data-section="experience"]').screenshot({ path: "qa/shot-experience.png" });
// geometry: the × must be inside its line, vertically centred
const geo = await page.evaluate(() => {
  const li = document.querySelector('[data-line="D1"]'); const x = li.querySelector(".ws-x"); const pen = li.querySelector(".ws-pen");
  const a = li.getBoundingClientRect(); const b = x.getBoundingClientRect(); const c = pen.getBoundingClientRect();
  const h = document.querySelector('[data-section="education"] .ws-sh'); const h3 = h.querySelector("h3");
  return { lineTop: a.top, lineBottom: a.bottom, xTop: b.top, xBottom: b.bottom, xRight: b.right, lineRight: a.right, xW: b.width, xH: b.height, penW: c.width, penH: c.height, penLeft: c.left, xLeft: b.left,
    rule: getComputedStyle(h).borderBottomWidth, h3rule: getComputedStyle(h3).borderBottomWidth, headW: h.getBoundingClientRect().width, secW: document.querySelector('[data-section="education"]').getBoundingClientRect().width };
});
console.log(JSON.stringify(geo));
await browser.close();
