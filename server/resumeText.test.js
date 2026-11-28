import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { jsPDF } from "jspdf";
import { registerResumeTextRoute } from "./resumeText.js";

const resumePdf = (options) => {
  const doc = new jsPDF(options);
  doc.text("Asha Rao", 20, 20);
  doc.text("HR Generalist at Example Pvt Ltd", 20, 30);
  return Buffer.from(doc.output("arraybuffer"));
};

async function post(body, type = "application/pdf") {
  const app = express();
  app.use(express.json());
  registerResumeTextRoute(app, { getUser: async () => null });
  app.use((err, _req, res, next) => (res.headersSent ? next(err) : res.status(err.status || 500).json({})));
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/resume-text`, { method: "POST", headers: { "Content-Type": type }, body });
    return { status: response.status, data: await response.json() };
  } finally {
    server.close();
  }
}

test("reads the text of a PDF in reading order", async () => {
  const { status, data } = await post(resumePdf());
  assert.equal(status, 200);
  assert.equal(data.text, "Asha Rao\nHR Generalist at Example Pvt Ltd");
});

test("says when a PDF needs a password", async () => {
  const { status, data } = await post(resumePdf({ encryption: { userPassword: "secret", ownerPassword: "owner" } }));
  assert.equal(status, 422);
  assert.equal(data.code, "password");
});

test("rejects files that aren't PDFs, or are damaged", async () => {
  for (const body of [Buffer.from("hello"), Buffer.from("%PDF-1.4\nnot really")]) {
    const { status, data } = await post(body);
    assert.equal(status, 422);
    assert.equal(data.code, "unreadable");
  }
  assert.equal((await post(resumePdf(), "text/plain")).status, 422);
});

test("rejects files over 4 MB", async () => {
  assert.equal((await post(Buffer.alloc(4 * 1024 * 1024 + 1, 1))).status, 413);
});
