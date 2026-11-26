// Maps each recorded HTTP turn (http-NNN-label.json) to the real model calls (model-NNN.json) that produced it.
import fs from "node:fs"; import path from "node:path";
const dir = process.argv[2];
const files = fs.readdirSync(dir);
const http = files.filter((f) => /^http-/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t);
const models = files.filter((f) => /^model-/.test(f)).map((f) => ({ f, t: Date.parse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).at) })).sort((a, b) => a.t - b.t);
let prev = 0; const idx = [];
for (const h of http) {
  const mine = models.filter((m) => m.t > prev - 50 && m.t <= h.t + 1500 && !idx.some((e) => e.models.includes(m.f)));
  idx.push({ label: h.f.replace(/^http-\d+[a-z]?-/, "").replace(/\.json$/, ""), http: h.f, models: mine.map((m) => m.f) });
  prev = h.t;
}
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(idx, null, 1));
console.log(idx.map((e) => `${e.label}: ${e.models.length} model call(s)`).join("\n"));
