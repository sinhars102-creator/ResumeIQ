// Reads a PDF resume's text for browsers that can't do it themselves (see src/resumePdfRead.js).
// The file is read in memory and never stored or logged.
import express from "express";
import { readPdfText } from "../src/pdfText.js";
import { aiGuard } from "./rateLimit.js";

const MAX_PAGES = 15;
const TIMEOUT_MS = 30000;

let loading = null;
function loadPdfjs() {
  loading ||= (async () => {
    // pdf.js builds one of these as it loads. Reading text never draws, so an empty class is enough when
    // the host doesn't have the optional canvas package.
    globalThis.DOMMatrix ||= class DOMMatrix {};
    // Importing the worker here (not by file path) makes sure the host ships it with the function.
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ]);
    globalThis.pdfjsWorker = worker;
    return pdfjs;
  })().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

export async function pdfTextFromBuffer(buffer) {
  const pdfjs = await loadPdfjs();
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS);
  });
  // A copy: pdf.js takes ownership of the bytes it is given.
  const read = readPdfText(pdfjs, new Uint8Array(buffer), { maxPages: MAX_PAGES, isEvalSupported: false, verbosity: 0 });
  return Promise.race([read, late]).finally(() => clearTimeout(timer));
}

export function registerResumeTextRoute(app, { getUser }) {
  app.post(
    "/api/resume-text",
    aiGuard({ getUser, anon: { windowMs: 600_000, max: 20 }, signedIn: { windowMs: 600_000, max: 60 } }),
    express.raw({ type: "application/pdf", limit: "4mb" }),
    async (req, res) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || !body.subarray(0, 1024).includes("%PDF-")) {
        return res.status(422).json({ error: "That file isn't a PDF.", code: "unreadable" });
      }
      try {
        res.set("Cache-Control", "no-store");
        return res.json({ text: await pdfTextFromBuffer(body) });
      } catch (error) {
        if (error?.name === "PasswordException") return res.status(422).json({ error: "The PDF is password-protected.", code: "password" });
        if (error?.name === "InvalidPDFException") return res.status(422).json({ error: "The PDF couldn't be read.", code: "unreadable" });
        console.error("[resume-text]", error?.name, error?.message);
        return res.status(500).json({ error: "Couldn't read the PDF." });
      }
    }
  );
}
