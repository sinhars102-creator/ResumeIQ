// Builds the extension for testers: a copy of extension/ pointed at the live site, with unfinished
// features left out, zipped as dist-extension/ResumeIQ-extension.zip (install: Load unpacked).
//   npm run ext:package            (live site: https://www.myresumeiq.io)
//   EXT_SITE=https://… npm run ext:package
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";

const site = (process.env.EXT_SITE || "https://www.myresumeiq.io").replace(/\/$/, "");
const { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: supabaseAnonKey } = process.env;
if (!supabaseUrl || !supabaseAnonKey) throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env first");

const out = new URL("../dist-extension/", import.meta.url).pathname;
const dir = `${out}ResumeIQ`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(new URL("../extension/", import.meta.url).pathname, dir, { recursive: true, filter: (src) => !/config(\.example)?\.js$/.test(src) });

writeFileSync(`${dir}/config.js`, `export const CONFIG = ${JSON.stringify({
  apiBase: site,
  appUrl: `${site}/app`,
  supabaseUrl,
  supabaseAnonKey,
  features: { easyApply: false }, // submitting applications needs the worker server
}, null, 2)};\n`);

// The live site only, and no LinkedIn sticker (on hold).
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"));
manifest.content_scripts = manifest.content_scripts
  .filter((c) => !c.js.includes("linkedinCard.js"))
  .map((c) => (c.js.includes("bridge.js") ? { ...c, matches: [`${site}/*`] } : c));
writeFileSync(`${dir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
rmSync(`${dir}/linkedinCard.js`);

// manifest.json at the zip's root, as the Chrome Web Store requires (unzipping makes a folder to load).
execFileSync("zip", ["-qr", "../ResumeIQ-extension.zip", "."], { cwd: dir });
console.log(`dist-extension/ResumeIQ-extension.zip – for ${site}`);
