import { useState } from "react";
import { needsAdConsent, setAdConsent } from "./googleAds.js";

/** A small bar asking to use cookies for measuring ads (live site only, until the visitor chooses). */
export default function CookieNotice() {
  const [open, setOpen] = useState(needsAdConsent);
  if (!open) return null;
  const choose = (accepted) => {
    setAdConsent(accepted);
    setOpen(false);
  };
  const button = { font: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, cursor: "pointer" };
  return (
    <div role="region" aria-label="Cookie notice"
      style={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 70, maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderRadius: 12, background: "#15171a", color: "#f6f5f1", fontSize: 13, lineHeight: 1.45, boxShadow: "0 10px 30px rgba(0,0,0,0.25)" }}>
      <span style={{ flex: "1 1 260px" }}>
        We use cookies to measure how people find ResumeIQ through our ads.{" "}
        <a href="/privacy.html" style={{ color: "#9fd3b8" }}>Privacy policy</a>
      </span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => choose(false)} style={{ ...button, background: "transparent", color: "#f6f5f1", border: "1px solid #5b6068" }}>Decline</button>
        <button type="button" onClick={() => choose(true)} style={{ ...button, background: "#9fd3b8", color: "#15171a", border: "1px solid #9fd3b8" }}>Accept</button>
      </span>
    </div>
  );
}
