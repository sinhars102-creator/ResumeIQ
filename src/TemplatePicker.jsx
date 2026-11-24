/**
 * Module M10 – choose a template: a preview of the candidate's own resume in each look, with the page count and a
 * content check ("all N items are in the PDF"). Choosing a template only changes the layout; the approved text is
 * never rewritten or cut (see src/resumeTemplates.js and src/preservation.js).
 *
 * Props: resume (the final resume, no removed bullets), selected (template id), onSelect(id).
 */
import { useEffect, useRef, useState } from "react";
import { buildResumePdf } from "./resumePdf.js";
import { TEMPLATES, templateFormat } from "./resumeTemplates.js";
import { checkPreserved, extractPdfText } from "./preservation.js";
import { pdfjs, renderPdfPages } from "./pdfPreview.js";

const photoOf = (resume) => (typeof resume?.photoUrl === "string" && resume.photoUrl.startsWith("data:") ? resume.photoUrl : null);

async function preview(resume, id) {
  const doc = buildResumePdf(resume, photoOf(resume), templateFormat(id));
  if (!doc) throw new Error("the resume couldn't be laid out");
  const data = doc.output("arraybuffer");
  const [text, images] = await Promise.all([extractPdfText(data.slice(0), pdfjs), renderPdfPages(data.slice(0), 600)]);
  return { pages: doc.getNumberOfPages(), check: checkPreserved(resume, text), images };
}

export default function TemplatePicker({ resume, selected, onSelect }) {
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
      const k = `${key}|${id}`;
      if (queued.current.has(k)) return;
      queued.current.add(k);
      chain.current = chain.current.then(async () => {
        let result;
        try {
          result = await preview(resume, id);
        } catch (e) {
          result = { error: e.message };
        }
        if (alive.current) setMade((m) => ({ ...m, [k]: result }));
      });
    });
  }, [key, selected, resume]);

  const at = (id) => made[`${key}|${id}`];
  const current = at(selected);
  return (
    <div className="rl-tpl">
      <div className="rl-tpl-chips" role="radiogroup" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={selected === t.id} className={`rl-tpl-chip${selected === t.id ? " is-on" : ""}`} onClick={() => onSelect(t.id)}>
            <b>{t.name}</b>
            <small>{at(t.id)?.pages ? `${at(t.id).pages} page${at(t.id).pages > 1 ? "s" : ""}` : t.blurb}</small>
          </button>
        ))}
      </div>
      {!current && <p className="rl-pay rl-tpl-wait">Preparing your preview…</p>}
      {current?.error && <p className="rl-warn">The preview couldn't be made ({current.error}).</p>}
      {current && !current.error && (
        <>
          <p className={current.check.ok ? "rl-tpl-ok" : "rl-warn"}>
            {current.check.ok
              ? `✓ Everything on your resume is in this PDF (${current.check.total} items checked).`
              : `Some text may be missing from this PDF: ${current.check.missing.slice(0, 3).join("; ")}${current.check.missing.length > 3 ? ` and ${current.check.missing.length - 3} more` : ""}.`}
          </p>
          <div className="rl-tpl-preview" aria-label="Preview">
            {current.images.map((src, i) => (
              <img key={i} src={src} alt={`Page ${i + 1} of ${current.images.length}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
