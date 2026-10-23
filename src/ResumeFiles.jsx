import { useEffect, useState } from "react";
import { supabase } from "./easyApply/supabaseClient.js";

// The signed-in user's resume files – the originals they uploaded (here or in the Chrome extension)
// and tailored ones saved for a job – kept in private storage and served only to them.
const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
const TYPES = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

async function authHeaders() {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  return session ? { Authorization: `Bearer ${session.access_token}` } : null;
}

async function api(path, options = {}) {
  const auth = await authHeaders();
  if (!auth) throw new Error("Sign in to see your resume files");
  const r = await fetch(`${API_BASE.replace(/\/$/, "")}${path}`, { ...options, headers: { "Content-Type": "application/json", ...auth, ...(options.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

/**
 * Keep the original uploaded file with the signed-in user's account, as their default resume (the
 * one the extension attaches). PDF and Word only; anything else, or signed out, is skipped quietly.
 */
export async function storeResumeFile(file) {
  if (!file) return null;
  const ext = String(file.name).split(".").pop().toLowerCase();
  const mimeType = TYPES[ext];
  if (!mimeType || !(await authHeaders())) return null;
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const name = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 60) || "My resume";
  return (await api("/api/ext/resumes", { method: "POST", body: JSON.stringify({ name, fileName: file.name, mimeType, base64, makeDefault: true }) })).resume;
}

/** Open (or download) one of the user's files exactly as stored. */
async function openFile(file, download) {
  const data = await api(`/api/ext/resume?id=${encodeURIComponent(file.id)}`);
  const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: data.mimeType }));
  if (download) {
    const a = Object.assign(document.createElement("a"), { href: url, download: data.fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtSize = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** "My resume files": a dialog listing the user's files with View and Download. */
export default function ResumeFilesDialog({ onClose }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api("/api/ext/resumes").then((d) => setFiles(d.resumes || [])).catch((e) => setError(e.message));
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (file, download) => {
    setBusy(`${file.id}-${download ? "d" : "v"}`);
    setError("");
    try {
      await openFile(file, download);
    } catch (e) {
      setError(`Couldn't open ${file.file_name}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(20,24,28,0.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rf-title" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "80vh", overflow: "auto", background: "var(--rq-surface, #fff)", color: "var(--rq-text)", borderRadius: 14, padding: 22, boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 id="rf-title" style={{ margin: 0, fontSize: 18 }}>My resume files</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "none", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "var(--rq-text-2)" }}>×</button>
        </div>
        <p style={{ margin: "6px 0 14px", fontSize: 13, color: "var(--rq-text-2)" }}>
          The files you uploaded and tailored resumes saved for a job, stored privately with your account. The default one is what the Chrome extension attaches.
        </p>
        {error && <div role="alert" style={{ fontSize: 13, color: "var(--rq-danger, #b5534a)", marginBottom: 10 }}>{error}</div>}
        {files === null && !error && <p style={{ fontSize: 14, color: "var(--rq-text-2)" }}>Loading…</p>}
        {files?.length === 0 && <p style={{ fontSize: 14, color: "var(--rq-text-2)" }}>No files yet – upload your resume and it's kept here.</p>}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {(files || []).map((f) => (
            <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid var(--rq-border)", borderRadius: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.name}
                  {f.is_default && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--rq-accent)" }}>Default</span>}
                  {f.source === "tailored" && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "var(--rq-text-2)" }}>Tailored</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--rq-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.file_name} · {fmtSize(f.size_bytes)} · {fmtDate(f.created_at)}
                </div>
              </div>
              <button type="button" onClick={() => run(f, false)} disabled={!!busy} style={{ font: "inherit", fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--rq-border)", background: "transparent", color: "var(--rq-text)", cursor: "pointer" }}>
                {busy === `${f.id}-v` ? "Opening…" : "View"}
              </button>
              <button type="button" onClick={() => run(f, true)} disabled={!!busy} style={{ font: "inherit", fontSize: 13, fontWeight: 600, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--rq-border)", background: "transparent", color: "var(--rq-text)", cursor: "pointer" }}>
                {busy === `${f.id}-d` ? "Downloading…" : "Download"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
