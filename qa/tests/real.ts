// Shared helpers for the REAL-model pass (7b). The page talks to the real server on QA_API (only the LLM key in its env);
// every other /api route stays mocked, Supabase is blocked.
// @ts-nocheck
import { Page, Route } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { session, REF, seedStore } from './fixture';
import * as L from '../llm/lib.mjs';

export const RUN = process.env.QA_RUN_DIR!; // absolute, e.g. .../qa/runs/2026-11-25_1425
export const CORPUS = path.join(RUN, 'llm-corpus');
export const OUT = path.join(RUN, 'scenarios');
fs.mkdirSync(CORPUS, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
let LABEL = 'unlabelled';
export const setLabel = (l: string) => { LABEL = l; };
let seq = fs.readdirSync(CORPUS).filter((f) => f.startsWith('http-')).length;

export async function bootReal(page: Page, store: any) {
  await page.addInitScript(([ref, s, st]) => {
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s));
    if (!localStorage.getItem('riq_resume_llm_v1')) localStorage.setItem('riq_resume_llm_v1', JSON.stringify(st));
    localStorage.setItem('riq_cookie_ok', '1');
  }, [REF, session, store] as const);
  await page.route('**/*.supabase.co/**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/api/**', async (route: Route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (p.startsWith('/api/tailor') || p.startsWith('/api/llm')) return route.continue();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (p === '/api/rllm/state') return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ state: { chats: [] } }) });
    if (p.startsWith('/api/downloads/status')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ allowed: true, plan: 'unl', remaining: null, unlimited: true, expiresAt: null }) });
    return route.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: '{"error":"unmocked"}' });
  });
  page.on('response', async (resp) => {
    const req = resp.request(); const u = new URL(resp.url());
    if (req.method() !== 'POST' || !(u.pathname.startsWith('/api/tailor') || u.pathname.startsWith('/api/llm'))) return;
    let text = ''; try { text = await resp.text(); } catch {}
    let body: any = req.postData(); try { body = JSON.parse(body); } catch {}
    const n = String(++seq).padStart(3, '0');
    fs.writeFileSync(path.join(CORPUS, `http-${n}-${LABEL}.json`), JSON.stringify({ label: LABEL, path: u.pathname, status: resp.status(), request: body, response: (() => { try { return JSON.parse(text); } catch { return text; } })() }, null, 1));
  });
  await page.goto('/app/editor', { waitUntil: 'networkidle' });
}

export const storeOf = (resume: any, over: any = {}) => seedStore({ resume, ...over });

export async function snap(page: Page) {
  return page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('riq_resume_llm_v1') || '{}');
    const chat = (st.chats || []).find((c: any) => c.id === st.activeId) || (st.chats || [])[0];
    const t = (e: any) => (e?.textContent || '').replace(/\s+/g, ' ').trim();
    const cards = [...document.querySelectorAll('.ws-card')].map((c: any) => ({
      id: c.id.replace('ws-card-', ''), cls: c.className, pin: t(c.querySelector('.ws-num')), where: t(c.querySelector('.ws-where')), tag: t(c.querySelector('.ws-tag')), pts: t(c.querySelector('.ws-pts')),
      why: t(c.querySelector('.ws-why')), done: t(c.querySelector('.ws-done')),
      blocks: [...c.querySelectorAll('.ws-txt')].map((x: any) => ({ text: t(x), dels: [...x.querySelectorAll('del')].map(t), inss: [...x.querySelectorAll('ins')].map(t) })),
      kws: [...c.querySelectorAll('.ws-kw span')].map(t),
    }));
    return {
      chat,
      dom: {
        h1: t(document.querySelector('.ws-head h1')), sub: t(document.querySelector('.ws-sub')), tabs: [...document.querySelectorAll('.ws-tabs button')].map(t), cards,
        paperPins: [...document.querySelectorAll('.ws-paper .ws-pin')].map((p: any) => ({ label: p.getAttribute('aria-label'), txt: t(p) })),
        score: t(document.querySelector('.ws-score')), thread: [...document.querySelectorAll('.ws-bub')].map(t), status: t(document.querySelector('.ws-status')),
        hl: [...document.querySelectorAll('.ws-paper [data-line]')].filter((l: any) => l.querySelector('ins')).map((l: any) => ({ line: l.dataset.line, text: t(l).replace(/^\d+\s*/, ''), ins: [...l.querySelectorAll('ins')].map(t) })),
        paperText: t(document.querySelector('.ws-paper')),
      },
    };
  });
}

/** Per-card checks for invariants 1, 2, 3, 9 on what the store holds and what the screen shows. */
export function checkCards(s: any, jd: string, userText = '') {
  const resume = s.chat.resume; const out: any[] = [];
  const list = Object.values(s.chat.suggestions || {}) as any[];
  for (const c of list.filter((x) => x.status === 'pending' && x.edit)) {
    const p = L.pairOf(resume, c); const dom = s.dom.cards.find((d: any) => d.id === c.id);
    const r: any = { id: c.id, pin: c.pin, target: c.edit.target, op: c.edit.op, title: c.title, before: p?.before, after: p?.after, issues: [] };
    if (p) {
      if (L.noop(p.before, p.after, p.list)) r.issues.push({ inv: 1, kind: 'no-op', detail: 'before and after equal after normalisation' });
      else { const lv = L.lowValue(p.before, p.after); if (lv) r.issues.push({ inv: 1, kind: 'low-value', detail: `only change is the word "${lv}"` }); }
      const lies = p.list ? [] : L.diffLies(p.before, p.after); if (lies.length) r.issues.push({ inv: 2, kind: 'diff-strikes-identical-looking-words', detail: lies });
      const ch = dom?.kws?.length ? dom.kws : L.chips(jd, c.before, p.after);
      const fc = L.falseChips(ch, resume, p.before); if (fc.length) r.issues.push({ inv: 3, kind: 'adds-chip-for-word-already-on-resume', detail: fc });
      if (dom) { const lies2 = (dom.blocks[0]?.dels || []).flatMap((d: string) => (dom.blocks[1]?.inss || []).filter((i: string) => d !== i && L.fold(d) === L.fold(i)).map((i: string) => ({ struck: d, added: i, cps: [L.cps(d), L.cps(i)] }))); if (lies2.length) r.screen = { dels: dom.blocks[0].dels, inss: dom.blocks[1].inss, kws: dom.kws }; }
      if (p.after) { const nf = L.newFacts(resume, p.after, userText + '\n' + jd); if (nf.numbers.length || nf.seniority.length) r.issues.push({ inv: 9, kind: 'new-facts', detail: nf }); r.newCapitalised = nf.capitalised; }
    }
    out.push(r);
  }
  return out;
}

/** Invariant 8 on one snapshot */
export function checkCounts(s: any) {
  const issues: string[] = []; const st = s.chat.suggestions || {};
  const listed = Object.values(st).filter((x: any) => x.pin != null) as any[];
  const by = (f: (x: any) => boolean) => listed.filter(f).length;
  const applied = by((x) => x.status === 'applied' || x.status === 'done'), pending = by((x) => x.status === 'pending'), dismissed = by((x) => x.status === 'dismissed');
  const m = /(\d+) of (\d+) suggestions applied/.exec(s.dom.sub || '');
  if (!m) issues.push(`header not found: "${s.dom.sub}"`); else { if (+m[1] !== applied) issues.push(`header says ${m[1]} applied, list has ${applied}`); if (+m[2] !== listed.length) issues.push(`header says ${m[2]} total, list has ${listed.length}`); }
  const tab = (name: string) => +((s.dom.tabs.find((t: string) => t.startsWith(name)) || '').match(/(\d+)$/)?.[1] ?? NaN);
  const tabs = { all: tab('All'), pending: tab('To review'), applied: tab('Applied'), dismissed: tab('Dismissed') };
  if (tabs.all !== listed.length) issues.push(`All tab ${tabs.all} vs list ${listed.length}`);
  if (tabs.pending !== pending) issues.push(`To review tab ${tabs.pending} vs pending ${pending}`);
  if (tabs.applied !== applied) issues.push(`Applied tab ${tabs.applied} vs applied ${applied}`);
  if (tabs.dismissed !== dismissed) issues.push(`Dismissed tab ${tabs.dismissed} vs dismissed ${dismissed}`);
  if (tabs.pending + tabs.applied + tabs.dismissed !== tabs.all) issues.push(`tabs do not add up: ${tabs.pending}+${tabs.applied}+${tabs.dismissed} != All ${tabs.all} (other statuses: ${[...new Set(listed.filter((x) => !['pending', 'applied', 'done', 'dismissed'].includes(x.status)).map((x) => x.status))].join(',')})`);
  if (s.dom.cards.length !== listed.length) issues.push(`cards on screen ${s.dom.cards.length} vs list ${listed.length}`);
  const pins = listed.map((x) => x.pin).sort((a, b) => a - b);
  if (new Set(pins).size !== pins.length) issues.push(`duplicate pin numbers: ${pins.join(',')}`);
  const cardPins = s.dom.cards.map((c: any) => c.pin).filter((p: string) => /^\d+$/.test(p)).map(Number);
  const expectedNumbered = listed.filter((x) => !['applied', 'done'].includes(x.status)).length;
  if (cardPins.length !== expectedNumbered) issues.push(`numbered cards ${cardPins.length} vs non-applied ${expectedNumbered}`);
  const paperNums = s.dom.paperPins.map((p: any) => p.txt).filter((x: string) => /^\d+$/.test(x)).map(Number);
  for (const n of paperNums) if (!pins.includes(n)) issues.push(`pin ${n} on the resume has no suggestion`);
  const withLine = listed.filter((x) => (x.edit?.target || x.target)).length;
  if (s.dom.paperPins.length !== withLine) issues.push(`pins on the resume ${s.dom.paperPins.length} vs suggestions with a line ${withLine} (suggestions with no line cannot show a pin)`);
  return { issues, tabs, applied, pending, dismissed, total: listed.length };
}

/** Invariant 10 */
export function checkHighlights(s: any, beforeResume: any) {
  const bad: any[] = [];
  for (const h of s.dom.hl) {
    const sug = (Object.values(s.chat.suggestions) as any[]).find((x) => x.status === 'applied' && (x.edit?.target || x.target) === h.line && x.before != null && x.edit?.op === 'replace');
    if (!sug) continue;
    const now = s.chat.resume; const cur = require_textAt(now, h.line);
    const d = L.wordDiffNorm(sug.before, cur);
    const changed = new Set(d.filter((x: any) => x.t === '+').flatMap((x: any) => x.text.split(' ')));
    const wrong = h.ins.flatMap((i: string) => i.split(/\s+/)).filter((w: string) => L.norm(w) && L.norm(w).split(' ').every((x: string) => !changed.has(x)));
    if (wrong.length) bad.push({ line: h.line, highlightedButUnchanged: wrong, before: sug.before, now: cur });
  }
  return bad;
}
import { textAt } from '../../src/tailorEdits.js';
const require_textAt = textAt;
