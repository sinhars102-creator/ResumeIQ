import fs from "node:fs"; import * as L from "./lib.mjs";
const dir = process.argv[2]; const snap = JSON.parse(fs.readFileSync(`${dir}/${process.argv[3]}.snap.json`, "utf8"));
const out = [];
for (const h of snap.dom.hl) {
  const sug = Object.values(snap.chat.suggestions).find((x) => x.status === "applied" && (x.edit?.target || x.target) === h.line && x.before != null && x.edit?.op === "replace");
  if (!sug) continue;
  const beforeWords = sug.before.split(/\s+/);
  const cat = { lookalike: [], punctOrCaseOnly: [], genuinelyNew: [] };
  for (const w of h.ins.flatMap((i) => i.split(/\s+/))) {
    if (beforeWords.some((v) => v !== w && L.fold(v) === L.fold(w))) cat.lookalike.push(w);
    else if (beforeWords.some((v) => v !== w && L.norm(v) === L.norm(w))) cat.punctOrCaseOnly.push(w);
    else cat.genuinelyNew.push(w);
  }
  out.push({ line: h.line, ...cat, codepoints: [...new Set(cat.lookalike.flatMap((w) => beforeWords.filter((v) => L.fold(v) === L.fold(w)).flatMap(L.cps)))] });
}
console.log(JSON.stringify(out, null, 1));
