/**
 * Google Ads images for ResumeIQ: product visuals in device mockups with a headline overlay (no
 * buttons, input fields or browser frames – Google's "misleading ad design" rule). The layout is
 * picked from the shape: landscape, square, portrait (4:5) or vertical (9:16).
 *
 *   npm run ads                                   – the standard set into src/assets/ads
 *   npm run ads -- --size=608x1080 --out="src/assets/Vertical ads"
 *   npm run ads -- --size=1080x1920,300x250 --only=apply
 */
import { mkdirSync } from "fs";
import { resolve } from "path";
import { chromium } from "playwright-core";

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").slice(name.length + 3);
const OUT = resolve(arg("out") || "src/assets/ads");
mkdirSync(OUT, { recursive: true });

const C = { green: "#17573f", ink: "#15171a", ink2: "#3c4047", muted: "#6b7076", ground: "#f6f5f1", mint: "#9fd3b8", mintSoft: "#e2eee7", line: "#e3e1da", amber: "#8a5300", amberSoft: "#fbebd2" };
const markSvg = (color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><g transform="translate(-1 0)" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 14l2 2 4-4"/></g></svg>`;
const brand = (s) => `<div style="display:flex;align-items:center;gap:${10 * s}px"><span style="width:${40 * s}px;height:${40 * s}px;border-radius:${10 * s}px;background:${C.green};display:grid;place-items:center">${markSvg("#fff", 24 * s)}</span><span style="font:800 ${26 * s}px 'Bricolage Grotesque';letter-spacing:-.02em;color:${C.ink}">MyResumeIQ<span style="color:${C.green}">.io</span></span></div>`;

/* ---------- product visuals (no buttons, no inputs) ---------- */
const ring = (pct, size, color = C.green) => `<div style="width:${size}px;height:${size}px;border-radius:50%;background:conic-gradient(${color} 0 ${pct}%,${C.line} ${pct}% 100%);display:grid;place-items:center;flex:none"><div style="width:${size * 0.76}px;height:${size * 0.76}px;border-radius:50%;background:#fff;display:grid;place-items:center;font:800 ${size * 0.3}px 'Bricolage Grotesque';color:${C.ink}">${pct}</div></div>`;
const jobCard = (title, company, meta, pct, label, tone) => `<div style="background:#fff;border:1px solid ${C.line};border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:16px">
  ${ring(pct, 58, tone === "amber" ? "#b7862f" : C.green)}
  <div style="flex:1;min-width:0"><div style="font:700 17px Manrope;color:${C.ink}">${title}</div><div style="font:500 13.5px Manrope;color:${C.muted};margin-top:3px">${company} · ${meta}</div></div>
  <span style="font:700 12px Manrope;padding:5px 10px;border-radius:20px;background:${tone === "amber" ? C.amberSoft : C.mintSoft};color:${tone === "amber" ? C.amber : C.green}">${label}</span></div>`;
const jobBoard = () => `<div style="background:${C.ground};padding:22px;display:flex;flex-direction:column;gap:12px;height:100%;box-sizing:border-box">
  <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font:800 22px 'Bricolage Grotesque';color:${C.ink}">Your job matches</span><span style="font:700 12px Manrope;color:${C.green};background:${C.mintSoft};padding:5px 10px;border-radius:20px">Top companies first</span></div>
  ${jobCard("Senior Product Manager", "Paybridge", "Bengaluru · Hybrid", 86, "Strong match", "green")}
  ${jobCard("Product Manager, Supply", "Kirana Cloud", "Gurugram", 74, "Good match", "green")}
  ${jobCard("Group PM, AI Platform", "Zestly", "Remote", 58, "Stretch", "amber")}</div>`;
const resumeEdit = () => `<div style="background:#fff;padding:26px 24px;height:100%;box-sizing:border-box;font-family:Manrope">
  <div style="font:800 22px 'Bricolage Grotesque';color:${C.ink}">Ananya Rao</div><div style="font:600 13px Manrope;color:${C.muted};margin:2px 0 16px">Senior Product Manager</div>
  <div style="font:800 11px Manrope;letter-spacing:.12em;color:${C.green};margin-bottom:8px">EXPERIENCE</div>
  <div style="height:9px;width:92%;background:${C.line};border-radius:5px;margin:8px 0"></div><div style="height:9px;width:78%;background:${C.line};border-radius:5px;margin:8px 0 14px"></div>
  <div style="border-left:3px solid ${C.green};background:${C.mintSoft};border-radius:8px;padding:12px 14px">
    <div style="font:500 13px Manrope;color:${C.muted};text-decoration:line-through">Worked on payments features for the app.</div>
    <div style="font:700 15px Manrope;color:${C.ink};margin-top:6px;line-height:1.35">Led UPI checkout redesign that lifted payment success from 82% to 91%.</div>
    <div style="font:700 11.5px Manrope;color:${C.green};margin-top:8px">✓ Approved by you · from your resume</div></div>
  <div style="height:9px;width:88%;background:${C.line};border-radius:5px;margin:16px 0 8px"></div><div style="height:9px;width:64%;background:${C.line};border-radius:5px;margin:8px 0"></div>
  <div style="height:9px;width:80%;background:${C.line};border-radius:5px;margin:8px 0"></div>
  <div style="font:700 13.5px Manrope;color:${C.ink};margin:18px 0 4px">Product Manager · Kirana Cloud</div>
  <div style="height:9px;width:90%;background:${C.line};border-radius:5px;margin:8px 0"></div><div style="height:9px;width:70%;background:${C.line};border-radius:5px;margin:8px 0"></div>
  <div style="font:800 11px Manrope;letter-spacing:.12em;color:${C.green};margin:20px 0 10px">SKILLS</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px">${["Product strategy","UPI","A/B testing","SQL","Roadmaps"].map((t)=>`<span style="font:600 11.5px Manrope;padding:4px 9px;border-radius:12px;background:${C.ground};color:${C.ink2}">${t}</span>`).join("")}</div></div>`;
const topFirst = () => `<div style="background:${C.ground};padding:22px;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:12px">
  <div style="background:${C.green};border-radius:14px;padding:18px 20px;color:#fff"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font:800 21px 'Bricolage Grotesque'">Tier 1</span><span style="font:600 13.5px Manrope;opacity:.9">Big Tech · Unicorns · Top GCCs</span></div>
    ${[["Senior Product Manager · Paybridge","2 days ago"],["Data Scientist · Zestly","4 days ago"]].map(([r,t])=>`<div style="display:flex;justify-content:space-between;font:600 13px Manrope;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.18)"><span>${r}</span><span style="opacity:.75">${t}</span></div>`).join("")}</div>
  ${[ ["Tier 2", "Established leaders", C.mintSoft, C.green], ["Everyone else", "Ranked after", "#fff", C.muted]].map(([t, d, bg, fg]) => `<div style="background:${bg};border:1px solid ${C.line};border-radius:14px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center"><span style="font:800 21px 'Bricolage Grotesque';color:${fg}">${t}</span><span style="font:600 13.5px Manrope;color:${fg};opacity:.9">${d}</span></div>`).join("")}
  <div style="font:600 13px Manrope;color:${C.muted};text-align:center;margin-top:4px">Newest roles first in every tier</div></div>`;

const applyReady = () => `<div style="background:${C.ground};padding:22px;height:100%;box-sizing:border-box;display:flex;gap:16px">
  <div style="flex:1;background:#fff;border:1px solid ${C.line};border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;justify-content:space-between;align-items:center"><span style="font:800 20px 'Bricolage Grotesque';color:${C.ink}">Application ready</span><span style="font:700 12px Manrope;color:${C.green};background:${C.mintSoft};padding:5px 10px;border-radius:20px">Senior PM · Paybridge</span></div>
    ${["Name, email and phone", "Work history · 5 roles", "CTC and notice period", "Screening answers", "Cover letter, when asked"].map((t) => `<div style="display:flex;align-items:center;gap:10px;font:600 14.5px Manrope;color:${C.ink2}"><span style="width:20px;height:20px;border-radius:50%;background:${C.green};display:grid;place-items:center;color:#fff;font:800 12px Manrope;flex:none">✓</span>${t}</div>`).join("")}
    <div style="margin-top:4px;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:${C.mintSoft}"><span style="width:30px;height:36px;border-radius:5px;background:#fff;border:1px solid ${C.line};display:grid;place-items:center;font:800 9px Manrope;color:#b5534a;flex:none">PDF</span><div><div style="font:700 13.5px Manrope;color:${C.ink}">Ananya_SeniorPM_Paybridge.pdf</div><div style="font:600 11.5px Manrope;color:${C.green}">Tailored resume attached</div></div></div></div>
  <div style="width:150px;background:${C.green};border-radius:14px;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center">
    <div style="font:800 54px/1 'Bricolage Grotesque'">8s</div><div style="font:600 13px Manrope;opacity:.9;padding:0 10px">to fill the whole form</div></div></div>`;

/* ---------- device mockups (no browser chrome) ---------- */
const laptop = (screen, w) => { const h = w * 0.62; return `<div style="width:${w}px"><div style="background:#1e2124;border-radius:${w * 0.03}px ${w * 0.03}px 0 0;padding:${w * 0.022}px"><div style="width:100%;height:${h}px;border-radius:${w * 0.008}px;overflow:hidden;position:relative"><div style="width:620px;height:${620 * 0.62}px;transform:scale(${(w - w * 0.044) / 620});transform-origin:0 0">${screen}</div></div></div><div style="height:${w * 0.035}px;background:linear-gradient(#c9ccd0,#a7abb0);border-radius:0 0 ${w * 0.06}px ${w * 0.06}px;margin:0 -${w * 0.06}px"></div></div>`; };
const phone = (screen, w) => { const h = w * 2.02; return `<div style="width:${w}px;height:${h}px;background:#1e2124;border-radius:${w * 0.16}px;padding:${w * 0.045}px;box-sizing:border-box;box-shadow:0 30px 60px rgba(21,23,26,.22)"><div style="width:100%;height:100%;border-radius:${w * 0.12}px;overflow:hidden;background:#fff;position:relative"><div style="width:340px;height:${340 * 2.02 * 0.91}px;transform:scale(${(w * 0.91) / 340});transform-origin:0 0;padding-top:24px;box-sizing:border-box">${screen}</div></div></div>`; };

/* ---------- the three ads ---------- */
const designs = {
  match: { headline: "See your match at top companies", sub: "Every role ranked for you, with your match %.", device: (w) => laptop(jobBoard(), w), kind: "laptop" },
  tailor: { headline: "Tailor your resume in minutes", sub: "Edits from your real experience. You approve each one.", device: (w) => phone(resumeEdit(), w), kind: "phone" },
  apply: { headline: "Apply with a tailored resume in seconds", sub: "Tailor it for the role. Autofill fills the form and attaches it.", device: (w) => laptop(applyReady(), w), kind: "laptop" },
  top: { headline: "Top companies first", sub: "Roles from career pages, ranked by company tier.", device: (w) => laptop(topFirst(), w), kind: "laptop" },
};

function page(d, [W, H], layout) {
  const bg = `background:radial-gradient(circle at 85% 15%, ${C.mintSoft} 0, rgba(226,238,231,0) 45%), ${C.ground}`;
  if (layout === "landscape") {
    const dw = d.kind === "phone" ? 230 : 560;
    return `<div style="width:${W}px;height:${H}px;${bg};display:flex;align-items:center;gap:40px;padding:0 64px;box-sizing:border-box">
      <div style="flex:1;display:flex;flex-direction:column;gap:22px">${brand(1)}<div style="font:800 58px/1.02 'Bricolage Grotesque';letter-spacing:-.03em;color:${C.ink}">${d.headline}</div><div style="font:500 22px/1.4 Manrope;color:${C.ink2}">${d.sub}</div></div>
      <div style="flex:none">${d.device(dw)}</div></div>`;
  }
  if (layout === "vertical") {
    const dw = d.kind === "phone" ? Math.min(660, W * 0.56) : W - 120;
    return `<div style="width:${W}px;height:${H}px;${bg};display:flex;flex-direction:column;align-items:center;padding:${Math.round(H * 0.055)}px 60px 0;box-sizing:border-box;overflow:hidden;text-align:center">
      ${brand(1.6)}<div style="font:800 ${Math.round(W * 0.086)}px/1.02 'Bricolage Grotesque';letter-spacing:-.03em;color:${C.ink};margin-top:40px">${d.headline}</div>
      <div style="font:500 ${Math.round(W * 0.033)}px/1.4 Manrope;color:${C.ink2};margin-top:24px;max-width:${W - 160}px">${d.sub}</div>
      <div style="flex:1;display:flex;align-items:center;justify-content:center;text-align:left;min-height:0;padding:30px 0">${d.device(dw)}</div>
      <div style="width:calc(100% + 120px);background:${C.green};color:#fff;padding:${Math.round(H * 0.034)}px 60px;box-sizing:border-box">
        <div style="font:800 ${Math.round(W * 0.044)}px/1.1 'Bricolage Grotesque';letter-spacing:-.02em">Tailor your resume. Apply in seconds.</div>
        <div style="font:700 ${Math.round(W * 0.026)}px Manrope;color:${C.mint};margin-top:10px">myresumeiq.io</div></div></div>`;
  }
  const dw = d.kind === "phone" ? (layout === "square" ? 480 : 440) : (layout === "square" ? 980 : 860);
  return `<div style="width:${W}px;height:${H}px;${bg};display:flex;flex-direction:column;align-items:center;padding:${layout === "square" ? 70 : 80}px 60px 0;box-sizing:border-box;overflow:hidden;text-align:center">
    ${brand(1.2)}<div style="font:800 ${layout === "square" ? 76 : 72}px/1.02 'Bricolage Grotesque';letter-spacing:-.03em;color:${C.ink};margin-top:30px;max-width:980px">${d.headline}</div>
    <div style="font:500 ${layout === "square" ? 28 : 27}px/1.4 Manrope;color:${C.ink2};margin:18px 0 ${layout === "square" ? 50 : 60}px;max-width:860px">${d.sub}</div>
    <div style="flex:none;text-align:left">${d.device(dw)}</div></div>`;
}

const fonts = `<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Manrope:wght@500;600;700;800&display=block" rel="stylesheet">`;
/** Layout and design width for a target size; the design is drawn at that width and scaled exactly. */
function layoutFor(w, h) {
  const r = w / h;
  if (r >= 1.4) return ["landscape", 1200];
  if (r >= 0.9) return ["square", 1200];
  if (r >= 0.7) return ["portrait", 960];
  return ["vertical", 1216];
}

const STANDARD = ["1200x628", "1200x1200", "1080x1080", "400x400", "960x1200"];
const sizes = (arg("size") ? arg("size").split(",") : STANDARD).map((x) => x.split("x").map(Number));
const only = arg("only");
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [key, d] of Object.entries(designs).filter(([k]) => !only || k === only)) {
  for (const [w, h] of sizes) {
    const [layout, designW] = layoutFor(w, h);
    const scale = w / designW;
    const designH = Math.round(h / scale);
    const pg = await b.newPage({ viewport: { width: designW, height: designH }, deviceScaleFactor: scale });
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8">${fonts}<style>html,body{margin:0}</style></head><body>${page(d, [designW, designH], layout)}</body></html>`, { waitUntil: "networkidle" });
    await pg.evaluate(() => document.fonts.ready);
    const name = `ad-${key}-${layout}-${w}x${h}.png`;
    await pg.screenshot({ path: `${OUT}/${name}` });
    console.log("made", name);
    await pg.close();
  }
}
await b.close();
