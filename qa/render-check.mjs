import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), scrollTo() {} };
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { default: W } = await server.ssrLoadModule("/src/ResumeWorkspace.jsx");
const resume = {
  name: "Rahul Sinha", title: "Senior PM", contact: "r@x.com", summary: "Nine years.",
  experience: [{ role: "Manager", company: "Blinkit", period: "2015", bullets: ["Built it", null, "Scaled it"] }, { removed: true, bullets: [] }],
  education: [{ degree: "B.Tech", school: "Manipal", year: "2016" }], skills: ["SQL"], certifications: ["PMP"],
  projects: [{ name: "Demand model", bullets: ["Forecast"] }], achievements: ["Top performer"],
  otherSections: [{ title: "Core Competencies", items: ["Strategy", "Roadmapping"] }], sectionOrder: ["skills", "summary"],
};
const sugg = { s1: { id: "s1", status: "pending", pin: 1, where: "Core", edit: { target: "SEC:other0", op: "remove_section" }, target: "SEC:other0", title: "Remove this section", before: "" },
  s2: { id: "s2", status: "pending", pin: 2, where: "Skills", edit: { target: "SEC:skills", op: "move_section", to: 3 }, target: "SEC:skills", title: "Move", before: "" },
  s3: { id: "s3", status: "pending", pin: 3, where: "Education", edit: { target: "D0", op: "remove" }, target: "D0", title: "x", before: "B.Tech" } };
const props = { resume, suggestions: sugg, title: "T", subtitle: "", score: { label: "Match", now: 60, base: 50, potential: 80, unit: "%" }, busy: false, status: "", blankValues: {}, setBlankValues() {}, flash: null, deltaOf: () => 0, keywordsOf: () => [], act: {}, canUndo: true, startInEdit: process.env.EDIT === "1", canRedo: false, thread: [] };
const html = renderToString(React.createElement(W, props));
const order = [...html.matchAll(/data-section="([a-z0-9]+)"/g)].map((m) => m[1]);
console.log("render ok, bytes:", html.length, "| section order:", order.join(","));
console.log("has Edit resume button:", html.includes("Edit resume"), "| removed role hidden:", !html.includes("undefined"));
if (process.env.EDIT === "1") for (const t of ["Move Skills up", "Move Skills down", "Rename", "Remove this line", "Add bullet", "Add education", "+ Add section", "Done editing", "Core Competencies section", "Add item"]) console.log("EDIT:", t, html.includes(t));
for (const t of ["Remove the whole", "New position", "Remove this education entry"]) console.log(t, html.includes(t));
await server.close();
