/**
 * Load the tiered list of top employers (server/seed/top-companies.csv) into public.companies:
 * companies we already know get their tier and category; new ones are added as "unprobed", so the
 * daily collection's discovery step looks for their job board. Safe to re-run after editing the CSV.
 *
 *   npm run seed:companies          – apply
 *   npm run seed:companies -- --dry – show what would change
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { companyKey } from "./jobStore.js";

const DRY = process.argv.includes("--dry");
const db = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Rows of the CSV: tier, company, category (extra columns are ignored). */
function readList() {
  const [, ...lines] = readFileSync(new URL("./seed/top-companies.csv", import.meta.url), "utf8").trim().split("\n");
  return lines.map((line) => {
    const cells = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"'));
    return { tier: Number(cells[0]), name: cells[1], category: cells[2] };
  }).filter((r) => r.name && [1, 2, 3].includes(r.tier));
}

/** Keys a company may already be stored under: its name, the parts outside/inside brackets, and short forms. */
function keysFor(name) {
  const keys = new Set();
  const add = (s) => {
    const k = companyKey(s);
    if (!k) return;
    keys.add(k);
    const short = k.replace(/\b(india|global tech|technologies|technology|r and d institute|r and d|gcc|in india)\b/g, " ").replace(/\s+/g, " ").trim();
    if (short.length >= 2) keys.add(short);
  };
  add(name);
  const bracket = name.match(/^(.*)\(([^)]*)\)\s*$/);
  if (bracket) {
    add(bracket[1]);
    add(bracket[2]);
  }
  return [...keys];
}

async function allCompanies() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("companies").select("id, name, name_key, status, tier").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const list = readList();
const known = await allCompanies();
const byKey = new Map(known.map((c) => [c.name_key, c]));
let updated = 0;
let added = 0;
for (const company of list) {
  // Prefer a row whose job board we already collect; otherwise any row with a matching key.
  const matches = keysFor(company.name).map((k) => byKey.get(k)).filter(Boolean);
  const existing = matches.find((c) => c.status === "active") || matches[0];
  if (existing) {
    if (!DRY) {
      const { error } = await db.from("companies").update({ tier: company.tier, category: company.category }).eq("id", existing.id);
      if (error) throw new Error(`${company.name}: ${error.message}`);
    }
    updated += 1;
  } else {
    if (!DRY) {
      const { error } = await db.from("companies").insert({ name: company.name, name_key: companyKey(company.name), origin: "curated", tier: company.tier, category: company.category });
      if (error) throw new Error(`${company.name}: ${error.message}`);
    }
    added += 1;
  }
}
console.log(`${DRY ? "[dry run] " : ""}${list.length} companies in the list: ${updated} already known (tier set), ${added} added as unprobed.`);
