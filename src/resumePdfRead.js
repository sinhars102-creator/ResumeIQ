// Reading an uploaded PDF resume. The browser reads it when it can. When it can't (too old, a blocked worker,
// a hang, or any other failure) the file is sent to our server, which reads it the same way.
import { loadPdfjs } from "./pdfjs.js";
import { readPdfText } from "./pdfText.js";
import { track } from "./analytics.js";

export const SERVER_PDF_LIMIT = 4 * 1024 * 1024; // the host accepts request bodies up to 4.5 MB
const BROWSER_TIMEOUT_MS = 20000;
const SERVER_TIMEOUT_MS = 45000;
const PASTE = "You can paste the text of your resume instead.";

/** A problem with the file, with a message written to be shown to the user as it is. */
export class ResumeFileError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = "ResumeFileError";
    this.reason = reason;
  }
}

export function withTimeout(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const passwordError = () => new ResumeFileError("password", `This PDF is password-protected. Upload a copy without a password. ${PASTE}`);

async function readInBrowser(file) {
  const pdfjs = await loadPdfjs();
  return readPdfText(pdfjs, new Uint8Array(await file.arrayBuffer()));
}

async function readOnServer(file, apiBase, fetchImpl) {
  if (file.size > SERVER_PDF_LIMIT) {
    throw new ResumeFileError("too_large", `This browser couldn't open your PDF, and the file is over 4 MB. Upload a smaller PDF. ${PASTE}`);
  }
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), SERVER_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${apiBase}/api/resume-text`, {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: file,
      signal: controller?.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && typeof data.text === "string") return data.text;
    if (data.code === "password") throw passwordError();
    if (data.code === "unreadable") {
      throw new ResumeFileError("unreadable", `This file looks damaged or isn't a PDF. Try saving it as a PDF again. ${PASTE}`);
    }
    throw new ResumeFileError("server", `I couldn't open this PDF just now. Please try again. ${PASTE}`);
  } catch (error) {
    if (error instanceof ResumeFileError) throw error;
    throw new ResumeFileError("network", `I couldn't open this PDF. Check your connection and try again. ${PASTE}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function readResumePdf(file, { apiBase = "", readLocal = readInBrowser, fetchImpl = (...args) => fetch(...args), timeoutMs = BROWSER_TIMEOUT_MS } = {}) {
  try {
    return await withTimeout(readLocal(file), timeoutMs);
  } catch (error) {
    if (error?.name === "PasswordException") throw passwordError();
    const browserError = String(error?.message || error).slice(0, 120);
    try {
      const text = await readOnServer(file, apiBase, fetchImpl);
      track("pdf_server_read", { ok: true, browser_error: browserError });
      return text;
    } catch (serverError) {
      track("pdf_server_read", { ok: false, browser_error: browserError, reason: serverError.reason });
      throw serverError;
    }
  }
}
