// Preload for the QA server: records every real model call (request + response, never headers/keys) and enforces a hard cap.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
const DIR = process.env.QA_CORPUS_DIR; const CAP = Number(process.env.QA_LLM_CAP || 80);
mkdirSync(DIR, { recursive: true });
const counter = DIR + "/_count.json";
const orig = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url || String(input);
  if (!/^https:\/\/api\.(groq\.com|anthropic\.com)\//.test(url)) return orig(input, init);
  const n = (existsSync(counter) ? JSON.parse(readFileSync(counter, "utf8")).n : 0) + 1;
  if (n > CAP) throw new Error(`QA model-call cap of ${CAP} reached`);
  writeFileSync(counter, JSON.stringify({ n }));
  const started = Date.now();
  let reqBody = null; try { reqBody = JSON.parse(init?.body); } catch {}
  let res, err;
  try { res = await orig(input, init); } catch (e) { err = e; }
  let text = null; if (res) { try { text = await res.clone().text(); } catch {} }
  const id = String(n).padStart(3, "0");
  writeFileSync(`${DIR}/model-${id}.json`, JSON.stringify({ n, at: new Date().toISOString(), ms: Date.now() - started, url: url.replace(/\?.*/, ""), request: reqBody, status: res?.status ?? null, response: (() => { try { return JSON.parse(text); } catch { return text; } })(), error: err ? String(err.message) : null }, null, 1));
  if (err) throw err;
  return res;
};
