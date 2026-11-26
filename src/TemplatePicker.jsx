/**
 * Module M10 – choose a template: a preview of the candidate's own resume in each look, with the page count and a
 * content check ("all N items are in the PDF"). Choosing a template only changes the layout; the approved text is
 * never rewritten or cut (see src/resumeTemplates.js and src/preservation.js).
 *
 * Props: resume (the final resume, no removed bullets), selected (template id), onSelect(id).
 */
import { useEffect, useRef, useState } from "react";
import { buildResumePdf } from "./resumePdf.js";
import { TEMPLATES, TEMPLATE_GROUPS, designFormat, normalizeDesign, DEFAULT_DESIGN, isDefaultDesign, templateById, FONT_CHOICES, SIZE_CHOICES, SPACING_CHOICES, MARGIN_CHOICES, ACCENT_CHOICES } from "./resumeTemplates.js";
import { checkPreserved, extractPdfText } from "./preservation.js";
import { pdfjs, renderPdfPages } from "./pdfPreview.js";

const photoOf = (resume) => (typeof resume?.photoUrl === "string" && resume.photoUrl.startsWith("data:") ? resume.photoUrl : null);

async function preview(resume, id, design) {
  const doc = buildResumePdf(resume, photoOf(resume), designFormat(id, design));
  if (!doc) throw new Error("the resume couldn't be laid out");
  const data = doc.output("arraybuffer");
  const [text, images] = await Promise.all([extractPdfText(data.slice(0), pdfjs), renderPdfPages(data.slice(0), 600)]);
  return { pages: doc.getNumberOfPages(), check: checkPreserved(resume, text), images };
}

/** The Design controls: font, size, spacing, margins, colour, heading rules. They change the look only. */
function DesignControls({ templateId, design, onChange }) {
  const d = normalizeDesign(design);
  const set = (patch) => onChange({ ...d, ...patch });
  const own = designFormat(templateId, DEFAULT_DESIGN);
  const underline = d.underline ?? !!own.headingUnderline;
  const group = (label, children) => (
    <div className="rl-dz-row">
      <span className="rl-dz-label">{label}</span>
      <div className="rl-dz-opts">{children}</div>
    </div>
  );
  const opt = (on, text, click, extra = {}) => (
    <button key={text} type="button" role="radio" aria-checked={on} className={`rl-dz-opt${on ? " is-on" : ""}`} onClick={click} {...extra}>{text}</button>
  );
  return (
    <div className="rl-dz" role="group" aria-label="Design">
      {group("Font", FONT_CHOICES.map(([k, l]) => opt(d.font === k || (!d.font && own.fontBody === k), l, () => set({ font: k }))))}
      {group("Text size", SIZE_CHOICES.map(([k, l]) => opt(d.size === k, l, () => set({ size: k }))))}
      {group("Spacing", SPACING_CHOICES.map(([k, l]) => opt(d.spacing === k, l, () => set({ spacing: k }))))}
      {group("Margins", MARGIN_CHOICES.map(([k, l]) => opt(d.margins === k, l, () => set({ margins: k }))))}
      {group("Colour", (
        <>
          {ACCENT_CHOICES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={d.accent === c} aria-label={`Colour ${c}`} className={`rl-dz-swatch${d.accent === c ? " is-on" : ""}`} style={{ background: c }} onClick={() => set({ accent: c })} />
          ))}
          <label className="rl-dz-custom">Custom <input type="color" value={d.accent || own.accentColor || "#3f7d6e"} onChange={(e) => set({ accent: e.target.value })} aria-label="Custom colour" /></label>
        </>
      ))}
      {group("Headings", (
        <label className="rl-dz-check"><input type="checkbox" checked={underline} onChange={(e) => set({ underline: e.target.checked })} /> Rule under section headings</label>
      ))}
      {/* Always in the layout (hidden while nothing has been changed), so the screen never jumps when it appears. */}
      <button type="button" className="rl-dz-reset" style={{ visibility: isDefaultDesign(d) ? "hidden" : "visible" }} tabIndex={isDefaultDesign(d) ? -1 : 0} aria-hidden={isDefaultDesign(d)} onClick={() => onChange({ ...DEFAULT_DESIGN })}>Reset to the template's own design</button>
    </div>
  );
}

export default function TemplatePicker({ resume, selected, onSelect, design = DEFAULT_DESIGN, onDesign }) {
  // The preview follows the controls a moment after the last change, so dragging a colour doesn't rebuild it every frame.
  const [settled, setSettled] = useState(design);
  useEffect(() => {
    const t = setTimeout(() => setSettled(design), 250);
    return () => clearTimeout(t);
  }, [design]);
  const dkey = JSON.stringify(normalizeDesign(settled));
  // Results are kept by the resume's content and template, so a re-render never throws away or restarts the work.
  const key = JSON.stringify(resume);
  const [made, setMade] = useState({}); // `${key}|${id}` -> { pages, check, images } | { error }
  const alive = useRef(true);
  const queued = useRef(new Set());
  const chain = useRef(Promise.resolve());
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // The chosen template first, then the others (so each chip can show its page count), one at a time.
  useEffect(() => {
    const order = [selected, ...TEMPLATES.map((t) => t.id).filter((id) => id !== selected)];
    order.forEach((id) => {
      const k = `${key}|${id}|${dkey}`;
      if (queued.current.has(k)) return;
      queued.current.add(k);
      chain.current = chain.current.then(async () => {
        let result;
        try {
          result = await preview(resume, id, settled);
        } catch (e) {
          result = { error: e.message };
        }
        if (alive.current) setMade((m) => ({ ...m, [k]: result }));
      });
    });
  }, [key, selected, resume, dkey]);

  const at = (id) => made[`${key}|${id}|${dkey}`];
  const current = at(selected);
  // Nothing on this screen changes size while previews are made: a card keeps its description and reserves a line for its
  // page count (showing the last known count until the new one arrives), and the preview keeps showing the last good
  // version, dimmed, until the new one is ready.
  const lastPages = useRef({});
  const lastGood = useRef(null);
  if (current && !current.error) lastGood.current = current;
  const pagesOf = (id) => {
    const n = at(id)?.pages ?? lastPages.current[id];
    if (at(id)?.pages) lastPages.current[id] = at(id).pages;
    return n ? `${n} page${n > 1 ? "s" : ""}` : "\u00A0";
  };
  const shown = current && !current.error ? current : lastGood.current;
  const updating = !current;
  return (
    <div className="rl-tpl">
      <div className="rl-tpl-opts">
      <div role="radiogroup" aria-label="Templates">
        {TEMPLATE_GROUPS.map((g) => (
          <div key={g.type} className="rl-tpl-group">
            <p className="rl-tpl-glabel"><b>{g.label}</b> <small>{g.note}</small></p>
            <div className="rl-tpl-chips">
              {TEMPLATES.filter((t) => t.type === g.type).map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={selected === t.id} className={`rl-tpl-chip${selected === t.id ? " is-on" : ""}`} onClick={() => onSelect(t.id)}>
                  <b>{t.name}</b>
                  <small className="rl-tpl-blurb">{t.blurb}</small>
                  <small className="rl-tpl-pages">{pagesOf(t.id)}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {onDesign && (
        <details className="rl-dz-box" open>
          <summary>Customise {templateById(selected).name}</summary>
          <DesignControls templateId={selected} design={design} onChange={onDesign} />
        </details>
      )}
      </div>
      <div className="rl-tpl-view">
      <p className={`rl-tpl-status ${current?.error ? "rl-warn" : shown?.check.ok && !updating ? "rl-tpl-ok" : shown && !shown.check.ok && !updating ? "rl-warn" : ""}`} role="status" aria-live="polite">
        {current?.error
          ? `The preview couldn't be made (${current.error}).`
          : updating
            ? "Updating the preview…"
            : shown.check.ok
              ? `✓ Everything on your resume is in this PDF (${shown.check.total} items checked).`
              : `Some text may be missing from this PDF: ${shown.check.missing.slice(0, 3).join("; ")}${shown.check.missing.length > 3 ? ` and ${shown.check.missing.length - 3} more` : ""}.`}
      </p>
      <div className={`rl-tpl-preview${updating ? " is-updating" : ""}`} role="region" tabIndex={0} aria-label="Preview">
        {shown ? shown.images.map((src, i) => <img key={i} src={src} alt={`Page ${i + 1} of ${shown.images.length}`} />) : <p className="rl-tpl-empty">Preparing your preview…</p>}
      </div>
      </div>
    </div>
  );
}
