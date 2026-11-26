import { tokenizeForMatch } from "../../src/matchScore.js";
import { wordDiff } from "../../src/wordDiff.js";
const jd = "Looking for high‑scale marketplace experience";
const jdTerms = new Set(tokenizeForMatch(jd));
const kw = (before, text) => { const had = new Set(tokenizeForMatch(before || "")); return [...new Set(tokenizeForMatch(text).filter((w) => jdTerms.has(w) && !had.has(w) && w.length > 3))]; };
const before = "Owned high-scale marketplace growth"; // ASCII hyphen on the resume
const after = "Owned high‑scale marketplace growth and liquidity"; // model emits U+2011
console.log("JD tokens:", [...jdTerms]);
console.log("Adds chips:", kw(before, after));
console.log("diff:", wordDiff(before, after).map((x) => x.t + ":" + x.text));
