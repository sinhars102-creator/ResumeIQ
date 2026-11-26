// ESC-001 deterministic reproduction against the REAL code (no model call).
import { cleanEdit, claimContext } from "../../server/tailorChat.js";
import { wordDiff } from "../../src/wordDiff.js";
import { tokenizeForMatch } from "../../src/matchScore.js";

// verbatim copy of wsKeywords in src/ResumeLLM.jsx (line ~1000; not exported)
const wsKeywords = (jd) => { const jdTerms = new Set(tokenizeForMatch(jd)); return (before, text) => { if (!jd || !text) return []; const had = new Set(tokenizeForMatch(before || "")); return [...new Set(tokenizeForMatch(text).filter((w) => jdTerms.has(w) && !had.has(w) && w.length > 3))].slice(0, 4); }; };
const cp = (s) => [...s].filter((c) => c.charCodeAt(0) > 126 || c.charCodeAt(0) < 32).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");

const HY = ["‐", "‑", "–", "−"];
const jd = "We need a PM for a high-scale, supply-side marketplace. High-scale systems, supply-side growth, marketplace liquidity.";
const out = [];
for (const h of HY) {
  const before = `Owned supply${h}side growth for a high${h}scale marketplace, 0→1 launch`;
  const resume = { title: "PM", summary: "x", experience: [{ company: "A", role: "PM", period: "2020", bullets: [before] }], skills: ["SQL"] };
  const ctx = claimContext(resume, jd);
  // (1) model returns the SAME line with ASCII hyphens only
  const afterSame = "Owned supply-side growth for a high-scale marketplace, 0→1 launch";
  // (2) model returns ASCII hyphens plus one trivial change (drops "a")
  const afterTrivial = "Owned supply-side growth for high-scale marketplace, 0→1 launch";
  for (const [label, after] of [["same-but-ascii", afterSame], ["ascii+drop-article", afterTrivial]]) {
    const edit = cleanEdit({ target: "E0B0", op: "replace", after }, resume, ctx);
    const d = wordDiff(before, after);
    out.push({ hyphen: "U+" + h.codePointAt(0).toString(16).toUpperCase(), label, cleanEditResult: edit ? "KEPT" : "dropped(null)", diff: d.map((x) => x.t + ":" + x.text), struckAndReadded: d.filter((x) => x.t === "-").map((x) => x.text).join(" | "), addsChip: wsKeywords(jd)(before, after) });
  }
}
console.log(JSON.stringify(out, null, 1));
// other invisible differences: what does the no-op filter `plain` treat as equal that a USER would see as different?
const plain = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
console.log("plain(Hindi A)===plain(Hindi B):", plain("प्रोडक्ट मैनेजर") === plain("विपणन प्रबंधक"));
console.log("plain('Grew 40%')===plain('Grew 4,0%'):", plain("Grew 40%") === plain("Grew 4,0%"));
console.log("plain('Cut cost 8%')===plain('Cut cost 80%') :", plain("Cut cost 8%") === plain("Cut cost 80%"));
console.log("plain('A->B')===plain('A+B'):", plain("C++ and C#") === plain("C and C"));
