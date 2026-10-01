import { useState, useEffect, useMemo, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { jsPDF } from "jspdf";

// PDF.js worker: bundle via Vite so production gets a valid asset URL (fixes "load failed" on Vercel)
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;


const SAMPLE_RESUME = {
  name: "Alex Chen",
  title: "Product Manager",
  contact:
    "alex.chen@email.com · (415) 555-0192 · linkedin.com/in/alexchen · San Francisco, CA",
  summary:
    "Product manager with 4 years of experience building consumer and B2B products. Comfortable working across design, engineering, and business teams to ship features users love.",
  experience: [
    {
      role: "Product Manager",
      company: "TechStartup Inc.",
      period: "2021 – Present",
      bullets: [
        "Managed product roadmap for a B2B analytics dashboard used by 200+ companies",
        "Worked with engineering team to ship new features on a two-week sprint cycle",
        "Interviewed customers and translated feedback into product requirements",
        "Helped grow the product from 50 to 200 business customers",
      ],
    },
    {
      role: "Associate Product Manager",
      company: "MidSize Corp",
      period: "2019 – 2021",
      bullets: [
        "Assisted senior PMs with writing product specs and user stories",
        "Ran weekly stakeholder syncs and maintained product documentation",
        "Helped launch a mobile app feature that increased daily active users",
      ],
    },
  ],
  education: [
    {
      degree: "B.S. Computer Science",
      school: "UC Berkeley",
      year: "2019",
    },
  ],
  skills: [
    "Product roadmapping",
    "User research",
    "SQL",
    "Jira",
    "Figma",
    "A/B testing",
    "Agile/Scrum",
  ],
};

const styles = {
  appRoot: {
    width: "100%",
    minHeight: "100vh",
    background: "#0a0a14",
    color: "#f0f0e8",
    padding: "24px 20px 40px",
    fontFamily:
      "'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex",
    justifyContent: "center",
    boxSizing: "border-box",
  },
  appInner: {
    width: "100%",
    maxWidth: 1200,
    boxSizing: "border-box",
  },
  stickyHeader: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: "12px 0 16px",
    background:
      "linear-gradient(to bottom, rgba(10,10,20,0.96), rgba(10,10,20,0.9), rgba(10,10,20,0))",
    backdropFilter: "blur(22px)",
    borderBottom: "1px solid #1e1e30",
    marginBottom: 24,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  logo: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    letterSpacing: 4,
    textTransform: "uppercase",
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#f0f0e8",
  },
  logoMark: {
    fontSize: 16,
    color: "#00e5a0",
  },
  stepNav: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
  },
  stepItem: (state) => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    opacity: state === "active" ? 1 : state === "past" ? 0.7 : 0.4,
    transition: "opacity 0.25s ease",
    cursor: "pointer",
    border: "none",
    background: "none",
    color: "inherit",
    font: "inherit",
    padding: "4px 0",
  }),
  stepCircle: (isActive) => ({
    width: 20,
    height: 20,
    borderRadius: "50%",
    border: `1px solid ${isActive ? "#00e5a0" : "#444"}`,
    color: isActive ? "#0a0a14" : "#f0f0e8",
    background: isActive ? "#00e5a0" : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
  }),
  stepLabel: {
    textTransform: "uppercase",
  },
  stepArrow: {
    fontSize: 10,
    opacity: 0.6,
  },
  mainCard: {
    background:
      "radial-gradient(circle at top left, #151528 0, #05050b 52%, #05050b 100%)",
    borderRadius: 20,
    border: "1px solid #1e1e30",
    padding: 24,
    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
  },
  stepSection: {
    animation: "fadeUp 0.6s ease-out forwards",
    opacity: 0,
  },
  uploadHero: {
    textAlign: "center",
    marginBottom: 32,
  },
  uploadTitle: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    letterSpacing: 3,
    color: "#00e5a0",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  uploadHeadline: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 700,
    color: "#f0f0e8",
    marginBottom: 8,
    lineHeight: 1.3,
  },
  uploadHeadlineAccent: {
    color: "#00e5a0",
  },
  uploadSubtext: {
    fontSize: 14,
    color: "#888",
    maxWidth: 480,
    margin: "0 auto",
    lineHeight: 1.5,
  },
  dropZone: {
    border: "2px dashed #333",
    borderRadius: 16,
    padding: "48px 24px",
    textAlign: "center",
    background: "rgba(30,30,48,0.4)",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
  },
  dropZoneHover: {
    borderColor: "rgba(0,229,160,0.5)",
    background: "rgba(0,229,160,0.06)",
  },
  dropZoneIcon: {
    fontSize: 36,
    marginBottom: 12,
    color: "#666",
  },
  dropZoneLabel: {
    fontSize: 15,
    color: "#f0f0e8",
    marginBottom: 4,
  },
  dropZoneBrowse: {
    fontSize: 13,
    color: "#00e5a0",
    cursor: "pointer",
  },
  dropZoneTypes: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 14,
    marginTop: 32,
    maxWidth: 560,
    marginLeft: "auto",
    marginRight: "auto",
  },
  featureCard: {
    background: "rgba(15,15,31,0.8)",
    border: "1px solid #1e1e30",
    borderRadius: 12,
    padding: 16,
  },
  featureCardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#f0f0e8",
    marginBottom: 4,
  },
  featureCardDesc: {
    fontSize: 11,
    color: "#888",
    lineHeight: 1.4,
  },
  parsingCard: {
    maxWidth: 420,
    margin: "0 auto",
    background: "rgba(15,15,31,0.9)",
    border: "1px solid #1e1e30",
    borderRadius: 14,
    padding: 24,
  },
  parsingFileRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  parsingFileIcon: {
    fontSize: 24,
    color: "#666",
  },
  parsingFileName: {
    fontSize: 14,
    color: "#f0f0e8",
    fontWeight: 500,
  },
  parsingFileSize: {
    fontSize: 12,
    color: "#666",
  },
  parsingStatusLine: {
    fontSize: 13,
    color: "#aaa",
    marginBottom: 16,
  },
  parsingList: {
    listStyle: "none",
    padding: 0,
    margin: 0,
  },
  parsingListItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "#888",
    marginBottom: 10,
  },
  parsingBulletDone: {
    color: "#00e5a0",
  },
  parsingBulletPending: {
    color: "#f5c842",
  },
  sectionHeader: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: 0.4,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#888",
  },
  twoColumn: {
    display: "flex",
    gap: 20,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  colLeft: {
    flex: "1 1 0",
    minWidth: 0,
  },
  colRightFixed: {
    width: 380,
    maxWidth: "100%",
    flexShrink: 0,
  },
  primaryButton: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    borderRadius: 999,
    padding: "10px 18px",
    border: "1px solid rgba(0,229,160,0.4)",
    background:
      "linear-gradient(135deg, rgba(0,229,160,0.22), rgba(0,229,160,0.05))",
    color: "#f0f0e8",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  ghostButton: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    borderRadius: 999,
    padding: "8px 14px",
    border: "1px solid #333",
    background: "transparent",
    color: "#888",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dangerButton: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid rgba(255,95,95,0.7)",
    background: "rgba(255,95,95,0.06)",
    color: "#ff5f5f",
    cursor: "pointer",
  },
  successButton: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid rgba(0,229,160,0.7)",
    background: "rgba(0,229,160,0.06)",
    color: "#00e5a0",
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.4,
    cursor: "default",
  },
  linkedInPanel: {
    background:
      "linear-gradient(135deg, rgba(15,15,31,0.95), rgba(10,10,20,0.98))",
    borderRadius: 16,
    border: "1px solid #1e1e30",
    padding: 18,
    marginBottom: 20,
  },
  panelLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  panelLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: "#888",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  smallPill: {
    fontSize: 10,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #333",
    color: "#888",
  },
  textArea: {
    width: "100%",
    minHeight: 120,
    resize: "vertical",
    background: "#0f0f1f",
    borderRadius: 10,
    border: "1px solid #1e1e30",
    padding: 12,
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: 13,
    color: "#f0f0e8",
    outline: "none",
  },
  input: {
    background: "#0f0f1f",
    borderRadius: 8,
    border: "1px solid #1e1e30",
    padding: "8px 12px",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: 13,
    color: "#f0f0e8",
    outline: "none",
  },
  smallHelpText: {
    marginTop: 6,
    fontSize: 11,
    color: "#666",
  },
  linkedInActions: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  monoStatus: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
  },
  jobGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: 18,
    marginTop: 10,
  },
  jobCard: (hovered) => ({
    position: "relative",
    background:
      "radial-gradient(circle at top left, rgba(35,35,70,0.7), rgba(7,7,16,0.98))",
    borderRadius: 16,
    border: hovered ? "1px solid #f0f0e8" : "1px solid #1e1e30",
    padding: 16,
    cursor: "pointer",
    transform: hovered ? "translateY(-3px)" : "translateY(0)",
    transition:
      "transform 0.18s ease-out, border-color 0.18s ease-out, box-shadow 0.18s ease-out",
    boxShadow: hovered
      ? "0 18px 50px rgba(0,0,0,0.7)"
      : "0 12px 32px rgba(0,0,0,0.5)",
  }),
  jobCompany: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#888",
    marginBottom: 4,
  },
  jobTitle: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 6,
  },
  jobMetaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  jobLocation: {
    fontSize: 12,
    color: "#888",
  },
  jobSalary: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    color: "#00e5a0",
  },
  badgePill: (badge) => {
    let bg = "rgba(0,229,160,0.08)";
    let color = "#00e5a0";
    if (badge === "Hot") {
      bg = "rgba(255,95,95,0.12)";
      color = "#ff5f5f";
    } else if (badge === "Urgent") {
      bg = "rgba(245,200,66,0.12)";
      color = "#f5c842";
    } else if (badge === "New" || badge === "Remote" || badge === "Just in") {
      bg = "rgba(0,229,160,0.12)";
      color = "#00e5a0";
    }
    return {
      fontFamily: "'DM Mono', monospace",
      fontSize: 10,
      padding: "4px 8px",
      borderRadius: 999,
      border: `1px solid ${color}`,
      background: bg,
      color,
      textTransform: "uppercase",
    };
  },
  matchPill: (score) => {
    const tier = getScoreTier(score);
    return {
      fontFamily: "'DM Mono', monospace",
      fontSize: 11,
      fontWeight: 700,
      padding: "4px 9px",
      borderRadius: 999,
      border: `1px solid ${tier.color}`,
      background: `${tier.color}22`,
      color: tier.color,
    };
  },
  sourcePill: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    padding: "3px 7px",
    borderRadius: 999,
    border: "1px solid rgba(65,132,228,0.7)",
    background: "rgba(65,132,228,0.16)",
    color: "#9bbcf6",
    textTransform: "uppercase",
  },
  jobPreview: {
    marginTop: 6,
    fontSize: 12,
    color: "#aaa",
    lineHeight: 1.5,
  },
  cardFooterRow: {
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  analyzeCta: (visible) => ({
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(240,240,232,0.5)",
    background: "rgba(240,240,232,0.06)",
    color: "#f0f0e8",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(6px)",
    transition: "opacity 0.16s ease, transform 0.16s ease",
    cursor: visible ? "pointer" : "default",
  }),
  jobModalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5,5,12,0.82)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "6vh 20px",
    overflowY: "auto",
    zIndex: 1000,
  },
  jobModalCard: {
    position: "relative",
    width: "100%",
    maxWidth: 720,
    background:
      "radial-gradient(circle at top left, rgba(35,35,70,0.9), rgba(7,7,16,0.99))",
    border: "1px solid #2a2a44",
    borderRadius: 20,
    padding: "32px 32px 28px",
    boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
  },
  jobModalClose: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "1px solid #333",
    background: "rgba(255,255,255,0.04)",
    color: "#aaa",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
  },
  jobModalDivider: {
    height: 1,
    background: "#1e1e30",
    margin: "16px 0",
  },
  jobModalJd: {
    fontSize: 13.5,
    lineHeight: 1.7,
    color: "#ccc",
    whiteSpace: "pre-wrap",
  },
  jobSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 18,
  },
  jobSummaryItem: {},
  jobSummaryLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#888",
    marginBottom: 4,
  },
  jobSummaryValue: {
    fontSize: 14,
    color: "#f0f0e8",
  },
  skillChip: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid #333",
    background: "rgba(255,255,255,0.04)",
    color: "#ddd",
  },
  jobModalActions: {
    marginTop: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  backRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    gap: 12,
  },
  backLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  backText: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1.3,
  },
  analyzeTitle: {
    fontSize: 14,
    color: "#aaa",
  },
  smallBackButton: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    borderRadius: 999,
    border: "1px solid #333",
    background: "transparent",
    color: "#888",
    padding: "6px 12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  sideCard: {
    background: "#0f0f1f",
    borderRadius: 14,
    border: "1px solid #1e1e30",
    padding: 14,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    background:
      "radial-gradient(circle at 30% 0, #00e5a0, rgba(0,229,160,0.1))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Playfair Display', serif",
    fontWeight: 700,
    fontSize: 16,
    color: "#0a0a14",
  },
  resumeName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 17,
    fontWeight: 700,
  },
  resumeTitle: {
    fontSize: 12,
    color: "#888",
  },
  jdScrollBox: {
    marginTop: 6,
    maxHeight: 200,
    overflow: "auto",
    borderRadius: 10,
    border: "1px solid #1e1e30",
    background: "#070712",
    padding: 10,
    fontSize: 11,
    color: "#666",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },
  scoreLayout: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
    alignItems: "center",
  },
  scoreCard: {
    background: "#0f0f1f",
    borderRadius: 16,
    border: "1px solid #1e1e30",
    padding: 18,
    marginBottom: 18,
  },
  scoreCircleWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
  },
  scoreMeta: {
    flex: 1,
    minWidth: 0,
  },
  scoreLabel: (color) => ({
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    fontWeight: 600,
    color,
    marginBottom: 4,
  }),
  scoreSummary: {
    fontSize: 13,
    color: "#888",
    marginBottom: 10,
  },
  breakdownGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0,1fr))",
    gap: 10,
    marginBottom: 8,
  },
  breakdownItemLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  breakdownBarOuter: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    background: "#141428",
    overflow: "hidden",
  },
  breakdownBarInner: (color, pct) => ({
    width: `${pct}%`,
    height: "100%",
    borderRadius: 999,
    background: `linear-gradient(90deg, ${color}, rgba(0,229,160,0.1))`,
  }),
  breakdownScore: {
    marginTop: 3,
    fontSize: 11,
    color: "#aaa",
  },
  keyGapsTitle: {
    marginTop: 6,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    color: "#f5c842",
  },
  keyGapsList: {
    marginTop: 4,
    fontSize: 12,
    color: "#f5c842",
    paddingLeft: 14,
  },
  suggestionsHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 10,
    gap: 10,
  },
  suggestionsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  suggestionCard: (state) => {
    const base = {
      background: "#0f0f1f",
      borderRadius: 14,
      border: "1px solid #1e1e30",
      padding: 14,
      transition:
        "border-color 0.16s ease, background-color 0.16s ease, opacity 0.16s ease",
    };
    if (state === "approved") {
      return {
        ...base,
        border: "1px solid rgba(0,229,160,0.35)",
        background: "rgba(0,229,160,0.03)",
        opacity: 1,
      };
    }
    if (state === "rejected") {
      return {
        ...base,
        opacity: 0.4,
      };
    }
    return base;
  },
  suggestionTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  sectionPill: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #333",
    color: "#aaa",
    textTransform: "uppercase",
  },
  typePill: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(0,229,160,0.5)",
    color: "#00e5a0",
    textTransform: "uppercase",
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
  },
  diffBlock: {
    background: "#080810",
    borderRadius: 10,
    border: "1px solid #191926",
    padding: 10,
    fontSize: 12,
    lineHeight: 1.5,
    color: "#ccc",
  },
  diffLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#888",
    marginBottom: 2,
  },
  diffBefore: {
    color: "#ff5f5f",
    textDecoration: "line-through",
  },
  diffAfter: {
    color: "#00e5a0",
  },
  whyLine: {
    marginTop: 6,
    fontStyle: "italic",
    fontSize: 11,
    color: "#666",
  },
  suggestionsFooterRow: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
  },
  previewLayout: {
    display: "flex",
    gap: 18,
    flexWrap: "wrap",
  },
  previewColumn: {
    flex: "1 1 0",
    minWidth: 0,
  },
  previewLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  previewLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#888",
  },
  previewAfterLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    color: "#00e5a0",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  resetButton: {
    marginTop: 18,
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
    borderRadius: 999,
    padding: "10px 18px",
    border: "1px solid rgba(0,229,160,0.4)",
    background: "#00e5a0",
    color: "#050510",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  resumePaper: {
    background: "#ffffff",
    color: "#222",
    borderRadius: 12,
    padding: "36px 40px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    borderLeft: "4px solid #a8c8e0",
  },
  resumePhoto: {
    width: 100,
    aspectRatio: "3/4",
    objectFit: "cover",
    borderRadius: 8,
    flexShrink: 0,
  },
  resumeHeaderRow: {
    display: "flex",
    gap: 24,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  resumeHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  resumeNameText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 900,
    marginBottom: 4,
  },
  resumeTitleText: {
    fontSize: 14,
    color: "#555",
    marginBottom: 6,
  },
  resumeContactText: {
    fontSize: 11,
    color: "#888",
    marginBottom: 10,
  },
  resumeHr: {
    border: 0,
    borderTop: "2px solid #111",
    margin: "10px 0 14px",
  },
  resumeSectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#5a6b8a",
    borderBottom: "1px solid #d0dce8",
    paddingBottom: 4,
    marginTop: 10,
    marginBottom: 6,
  },
  resumeBodyText: {
    fontSize: 12,
    color: "#444",
    lineHeight: 1.6,
  },
  resumeExpHeaderRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
  resumeExpTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "#333",
  },
  resumeExpPeriod: {
    fontSize: 11,
    color: "#666",
  },
  resumeBullets: {
    paddingLeft: 18,
    marginTop: 4,
  },
  resumeBullet: {
    fontSize: 12,
    color: "#444",
    marginBottom: 3,
  },
  resumeEducationRow: {
    marginTop: 6,
    fontSize: 12,
    color: "#444",
  },
  resumeSkillsWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  resumeSkillChip: {
    background: "#e8eef4",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    color: "#333",
  },
  resumeHighlight: {
    background: "rgba(0,200,120,0.15)",
    borderRadius: 3,
    padding: "1px 3px",
  },
  resumeHighlightAfter: {
    background: "rgba(0,229,160,0.15)",
    borderRadius: 3,
    padding: "1px 3px",
  },
};

function getStepOrder(step) {
  switch (step) {
    case "upload":
      return 1;
    case "parsing":
      return 2;
    case "select":
      return 3;
    case "analyze":
    case "suggestions":
      return 4;
    case "preview":
      return 5;
    default:
      return 1;
  }
}

function getScoreTier(score) {
  if (score >= 75) {
    return { color: "#00e5a0", label: "Strong Match" };
  }
  if (score >= 55) {
    return { color: "#f5c842", label: "Moderate Match" };
  }
  return { color: "#ff5f5f", label: "Needs Alignment" };
}

const MATCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "will", "are", "that", "this",
  "from", "have", "has", "our", "to", "of", "in", "on", "at", "as", "is",
  "be", "by", "or", "we", "it", "its", "their", "they", "them", "who",
  "what", "when", "where", "why", "how", "not", "but", "if", "can",
  "across", "into", "more", "most", "also", "than", "then", "over",
  "under", "about", "each", "every", "both", "other", "such", "only",
  "own", "same", "too", "very", "just", "should", "now", "new", "team",
  "teams", "role", "work", "working", "years", "year",
]);

function tokenizeForMatch(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !MATCH_STOPWORDS.has(w));
}

function buildResumeCorpus(resume) {
  const parts = [
    resume.title || "",
    resume.summary || "",
    (resume.skills || []).join(" "),
    ...(resume.experience || []).flatMap((e) => [e.role || "", ...(e.bullets || [])]),
  ];
  return parts.join(" \n ");
}

/**
 * Client-side keyword/skills overlap score — no API calls, so it can run
 * instantly across an entire job grid (up to 150 results) without hitting
 * Claude rate limits or cost. The detailed Claude-scored breakdown still
 * runs on-demand in scoreResume() once a specific job is opened.
 */
function computeLocalMatchScore(resume, job) {
  if (!resume || !job) return null;
  const jdText = `${job.role || ""} ${job.jd || ""}`;
  const jdTokens = tokenizeForMatch(jdText);
  const resumeTokens = tokenizeForMatch(buildResumeCorpus(resume));
  if (!jdTokens.length || !resumeTokens.length) return null;

  const resumeSet = new Set(resumeTokens);
  const jdFreq = new Map();
  jdTokens.forEach((t) => jdFreq.set(t, (jdFreq.get(t) || 0) + 1));

  let matchedWeight = 0;
  let totalWeight = 0;
  jdFreq.forEach((count, term) => {
    const weight = Math.min(count, 4);
    totalWeight += weight;
    if (resumeSet.has(term)) matchedWeight += weight;
  });
  const keywordScore = totalWeight ? matchedWeight / totalWeight : 0;

  const skills = resume.skills || [];
  const jdLower = jdText.toLowerCase();
  const matchedSkills = skills.filter((s) => s && jdLower.includes(s.toLowerCase()));
  const skillScore = skills.length ? matchedSkills.length / skills.length : keywordScore;

  const titleTokens = new Set(tokenizeForMatch(resume.title || ""));
  const roleTokens = tokenizeForMatch(job.role || "");
  const titleOverlap = roleTokens.length
    ? roleTokens.filter((t) => titleTokens.has(t)).length / roleTokens.length
    : 0;

  const combined = skillScore * 0.45 + keywordScore * 0.35 + titleOverlap * 0.2;
  const score = Math.round(30 + combined * 66);

  return { score: Math.max(5, Math.min(98, score)), matchedSkills };
}

/**
 * Run a prompt through the API server (server/llm.js picks Groq or Claude),
 * so no model API key is shipped to the browser. Every caller expects JSON.
 */
async function callLLM(system, user, maxTokens) {
  const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
  const response = await fetch(`${base}/api/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user, maxTokens, json: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `AI request failed (${response.status})`);
  }
  return data.text || "";
}

async function extractLinkedInJob(pastedText) {
  const fallback = {
    company: "LinkedIn Company",
    role: "Role from LinkedIn Post",
    location: "Location not specified",
    salary: "Not disclosed",
    badge: "New",
    jd: pastedText || "Job description could not be parsed.",
  };
  try {
    const system =
      "Extract job details from LinkedIn posts. Return ONLY valid JSON, no markdown, no explanation.";
    const user = `Extract these fields from the LinkedIn job post and return ONLY a JSON object:
{
  "company": "company name",
  "role": "job title",
  "location": "city or remote status",
  "salary": "compensation range or 'Not disclosed'",
  "badge": "one of: Hot, Urgent, New, Remote — infer from language",
  "jd": "full job description text"
}

LinkedIn post:
${pastedText}`;
    const text = await callLLM(system, user, 1500);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      company: parsed.company || fallback.company,
      role: parsed.role || fallback.role,
      location: parsed.location || fallback.location,
      salary: parsed.salary || fallback.salary,
      badge: parsed.badge || fallback.badge,
      jd: parsed.jd || fallback.jd,
    };
  } catch (e) {
    console.error("LinkedIn extraction error, using fallback:", e);
    return fallback;
  }
}

const COMMON_SKILL_TERMS = [
  "SQL", "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java", "AWS", "GCP", "Azure",
  "Kubernetes", "Docker", "Figma", "Jira", "A/B testing", "Agile", "Scrum", "SEO", "SEM",
  "Product roadmapping", "User research", "Data analysis", "Machine learning", "REST APIs",
  "GraphQL", "Salesforce", "HubSpot", "Excel", "Tableau", "Looker", "Power BI",
  "Stakeholder management", "Go-to-market", "Growth strategy", "Financial modeling",
];

function heuristicExtractSkills(jd) {
  const text = (jd || "").toLowerCase();
  return COMMON_SKILL_TERMS.filter((s) => text.includes(s.toLowerCase())).slice(0, 8);
}

function heuristicExtractYears(jd) {
  const match = (jd || "").match(/(\d{1,2}\+?\s*(?:-|to)?\s*\d{0,2}\+?)\s*\+?\s*years?/i);
  return match ? `${match[1].trim()} years` : "Not specified";
}

/** Total years of experience: the parser's figure, else the span from the earliest role's start year to today. */
function getCandidateYears(resume) {
  if (!resume) return null;
  const stated = Number(resume.yearsOfExperience);
  if (Number.isFinite(stated) && stated > 0) return Math.round(stated);
  const startYears = (resume.experience || [])
    .map((e) => (String(e.period || "").match(/(19|20)\d{2}/) || [])[0])
    .filter(Boolean)
    .map(Number);
  if (!startYears.length) return null;
  return Math.max(0, new Date().getFullYear() - Math.min(...startYears));
}

/** LinkedIn experience-level codes (f_E) to search for a given number of years. */
function yearsToLinkedInLevels(years) {
  if (years == null) return [];
  if (years < 1) return ["1", "2"];
  if (years < 3) return ["2", "3"];
  if (years < 6) return ["3", "4"];
  if (years < 12) return ["4", "5"];
  return ["5", "6"];
}

/** Years range a JD asks for, e.g. "4-6 years" → { min: 4, max: 6 }, "5+ years" → { min: 5, max: null }. */
function parseJdYearsRange(jd) {
  const match = (jd || "").match(/(\d{1,2})\s*(?:(?:-|–|—|to)\s*(\d{1,2}))?\s*(\+)?\s*(?:\+\s*)?years?/i);
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : null;
  if (min > 30 || (max != null && max < min)) return null;
  return { min, max };
}

/** True when the JD's stated range sits clearly below the candidate's experience. */
function isBelowCandidateLevel(job, candidateYears) {
  if (!candidateYears) return false;
  const range = parseJdYearsRange(job.jd);
  if (!range) return false;
  if (range.max != null) return range.max <= candidateYears - 3;
  return range.min <= candidateYears - 6;
}

/**
 * On-demand Claude summary for the job detail modal — called once per job
 * when a card is opened (not for the whole grid), so a single API call here
 * is cheap, unlike the bulk scoring computeLocalMatchScore() avoids.
 */
async function summarizeJobPosting(job) {
  const fallback = {
    skills: heuristicExtractSkills(job.jd),
    yearsOfExperience: heuristicExtractYears(job.jd),
    domain: "Not specified",
  };
  try {
    const system =
      "You summarize job postings into structured fields for a quick-glance card. Return ONLY valid JSON, no markdown, no explanation.";
    const user = `Read this job description and extract a concise summary.

Return ONLY a JSON object with this shape:
{
  "skills": ["up to 8 key skills/technologies/tools mentioned, short labels"],
  "yearsOfExperience": "required experience, e.g. '5+ years' or 'Not specified'",
  "domain": "one short industry/domain label, e.g. 'Fintech', 'E-commerce', 'Healthcare', 'B2B SaaS', 'Consumer Social' — infer from context, 'Not specified' if unclear"
}

Job title: ${job.role || ""}
Company: ${job.company || ""}
Job description:
${job.jd || ""}`;
    const text = await callLLM(system, user, 500);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      skills:
        Array.isArray(parsed.skills) && parsed.skills.length
          ? parsed.skills.slice(0, 8)
          : fallback.skills,
      yearsOfExperience: parsed.yearsOfExperience || fallback.yearsOfExperience,
      domain: parsed.domain || fallback.domain,
    };
  } catch (e) {
    console.error("Job summary error, using fallback:", e);
    return fallback;
  }
}

async function extractResumeFromText(pastedText) {
  try {
    const system =
      "You are a resume parser. Extract structured data from resume text. Return ONLY valid JSON, no markdown, no explanation.";
    const user = `Extract the following from this resume text and return ONLY a JSON object with this exact structure (use empty strings or empty arrays where info is missing):

{
  "name": "full name",
  "title": "the professional headline/tagline directly beneath the candidate's name if the resume has one (e.g. a pipe-separated list of specialties or a positioning statement); otherwise their current or most recent job title",
  "targetRoles": ["2-4 concise job title phrases (2-5 words each) this candidate should search for, based on their WHOLE profile — headline, top-rated skills, and career trajectory across all roles — not just their literal most recent job title. E.g. a candidate whose skills emphasize Business Strategy and Digital Transformation alongside Product should get roles like 'Strategy Manager', 'Digital Transformation Lead', 'Product Strategy Manager', not only 'Product Manager'."],
  "contact": "email, phone, location, LinkedIn — one line",
  "yearsOfExperience": "total years of professional work experience as a number (use a stated figure if the resume gives one, otherwise compute from the earliest role's start date to today)",
  "summary": "professional summary or objective paragraph",
  "experience": [
    {
      "role": "job title",
      "company": "company name",
      "location": "city/place if mentioned",
      "period": "e.g. 2021 – Present",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ],
  "education": [
    { "degree": "degree name", "school": "school name", "year": "graduation year" }
  ],
  "skills": ["skill1", "skill2", ...],
  "interests": ["interest1", "interest2"] or [],
  "languages": ["Language1", "Language2"] or [],
  "references": [{"name": "Ref Name", "title": "Their Title"}] or []
}

Rules:
- Include EVERY role. If a role has dates and bullets but no company or title (e.g. a continuation on the next page), still include it with company/role as "" – never drop its bullets.
- Copy every bullet and the summary VERBATIM from the resume text (only remove bullet symbols and fix line breaks). Do not shorten, reword or merge them.
- The text may list a sidebar (contact, skills, education) separately from the main column; assign each item to its correct section.

Resume text:
${pastedText}`;
    const text = await callLLM(system, user, 4096);
    if (!text || typeof text !== "string") {
      throw new Error("The AI model returned no content. Check your API key and quota.");
    }
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      name: parsed.name || "Unknown",
      title: parsed.title || "",
      targetRoles: Array.isArray(parsed.targetRoles) ? parsed.targetRoles.filter(Boolean).slice(0, 4) : [],
      contact: parsed.contact || "",
      yearsOfExperience: Number.isFinite(Number(parsed.yearsOfExperience)) ? Number(parsed.yearsOfExperience) : null,
      summary: parsed.summary || "",
      experience: Array.isArray(parsed.experience) ? parsed.experience : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      references: Array.isArray(parsed.references) ? parsed.references : [],
    };
  } catch (e) {
    console.error("Resume extraction error:", e);
    throw e;
  }
}

/** The resume without its embedded photo – the AI never needs it, and the data URL alone can exceed request limits. */
function resumeForAI(resume) {
  if (!resume) return resume;
  // eslint-disable-next-line no-unused-vars
  const { photoUrl, ...rest } = resume;
  return rest;
}

async function scoreResume(job, resumeData) {
  // Used for any field the model leaves out; on a failed call the step shows "Score unavailable" instead of made-up numbers.
  const fallback = {
    score: null,
    label: "Score unavailable",
    summary: "",
    breakdown: { skills: 0, experience: 0, impact: 0, keywords: 0 },
    keyGaps: [],
  };
  try {
    const system =
      "You are a professional resume evaluator. Return ONLY valid JSON, no markdown.";
    const user = `You are evaluating how well a candidate's resume matches a specific job description.

Return ONLY a JSON object with this shape:
{
  "score": 0-100,
  "label": "Strong Match | Moderate Match | Needs Alignment",
  "summary": "2–3 sentence overview of fit.",
  "breakdown": {
    "skills": 0-25,
    "experience": 0-25,
    "impact": 0-25,
    "keywords": 0-25
  },
  "keyGaps": ["gap 1", "gap 2", "gap 3"]
}

Job description:
${job.jd}

Resume JSON:
${JSON.stringify(resumeForAI(resumeData), null, 2)}`;
    const text = await callLLM(system, user, 1500);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      score: typeof parsed.score === "number" ? parsed.score : fallback.score,
      label: parsed.label || fallback.label,
      summary: parsed.summary || fallback.summary,
      breakdown: {
        skills:
          parsed.breakdown && typeof parsed.breakdown.skills === "number"
            ? parsed.breakdown.skills
            : fallback.breakdown.skills,
        experience:
          parsed.breakdown && typeof parsed.breakdown.experience === "number"
            ? parsed.breakdown.experience
            : fallback.breakdown.experience,
        impact:
          parsed.breakdown && typeof parsed.breakdown.impact === "number"
            ? parsed.breakdown.impact
            : fallback.breakdown.impact,
        keywords:
          parsed.breakdown && typeof parsed.breakdown.keywords === "number"
            ? parsed.breakdown.keywords
            : fallback.breakdown.keywords,
      },
      keyGaps:
        Array.isArray(parsed.keyGaps) && parsed.keyGaps.length
          ? parsed.keyGaps.slice(0, 3)
          : fallback.keyGaps,
    };
  } catch (e) {
    console.error("Score error:", e);
    return {
      ...fallback,
      unavailable: true,
      summary: `We couldn't score this resume against the job (${e.message || "AI request failed"}). The assistant below can still help you tailor it.`,
    };
  }
}

const MAX_BULLETS_PER_EXPERIENCE = 3;

/** Apply approved suggestions to resume on the client so AFTER view always shows changes. */
function applyApprovedChangesClientSide(resumeData, approvedSuggestions) {
  if (!resumeData || !approvedSuggestions?.length) return resumeData;
  const resume = JSON.parse(JSON.stringify(resumeData));

  approvedSuggestions.forEach((s) => {
    const { section, type, original, proposed } = s;
    const experienceIndex = typeof s.experienceIndex === "number" ? s.experienceIndex : 0;

    if (section === "Summary" && (type === "Rewrite" || type === "Addition")) {
      if (!proposed || typeof proposed !== "string") return;
      // The assistant can rewrite one sentence of the summary; replace just that sentence when it's found.
      const current = resume.summary || "";
      if (type === "Rewrite" && original && original !== current && current.includes(original)) {
        resume.summary = current.replace(original, proposed);
      } else {
        resume.summary = proposed;
      }
      return;
    }

    if (section === "Experience") {
      const experiences = resume.experience || [];
      if (type === "Removal" && original?.trim()) {
        for (const exp of experiences) {
          const bullets = exp.bullets || [];
          const idx = bullets.findIndex((b) => b === original || (b && b.trim() === original.trim()));
          if (idx !== -1) {
            bullets.splice(idx, 1);
            return;
          }
        }
        return;
      }
      if (type === "Addition" && proposed && typeof proposed === "string") {
        const targetExp = experiences[experienceIndex] ?? experiences[0];
        if (targetExp) {
          targetExp.bullets = targetExp.bullets || [];
          const bullet = proposed.replace(/^\s*[•\-–*]\s*/, "").trim();
          const norm = (t) => String(t || "").replace(/^\s*[•\-–*]\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
          // Skip a bullet that's already there (e.g. the same addition accepted twice).
          if (!targetExp.bullets.some((b) => norm(b) === norm(bullet))) targetExp.bullets.push(bullet);
        }
        return;
      }
      if (type === "Rewrite" && proposed && typeof proposed === "string" && original?.trim()) {
        for (const exp of experiences) {
          const bullets = exp.bullets || [];
          const idx = bullets.findIndex((b) => b === original || (b && b.trim() === original.trim()));
          if (idx !== -1) {
            bullets[idx] = proposed;
            return;
          }
        }
      }
      return;
    }

    if (section === "Skills") {
      if (type === "Rewrite" && original && proposed) {
        resume.skills = proposed.split(/[,·|]|\s+\|\s+/).map((x) => x.trim()).filter(Boolean);
      } else if (type === "Addition" && proposed) {
        resume.skills = resume.skills || [];
        resume.skills.push(proposed.trim());
      }
      return;
    }

    if (section === "Education" && type === "Addition" && proposed && resume.education?.length) {
      const last = resume.education[resume.education.length - 1];
      if (last.notes) last.notes += " " + proposed;
      else last.notes = proposed;
    }
  });

  return resume;
}

/** Photo size in PDF: 3:4 aspect ratio (same as on-screen). */
const PHOTO_WIDTH_MM = 28;
const PHOTO_HEIGHT_MM = Math.round(PHOTO_WIDTH_MM * (4 / 3) * 10) / 10;

const DEFAULT_SECTION_ORDER = ["summary", "experience", "education", "skills"];
const PDF_FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica" },
  { value: "times", label: "Times New Roman" },
  { value: "courier", label: "Courier" },
];

const RX_TEMPLATE_OPTIONS = [
  { id: "azurill", label: "Azurill", tags: ["Creative", "Tech", "Two-column", "Visual flair"] },
  { id: "bronzor", label: "Bronzor", tags: ["Clean", "Consulting", "Corporate", "Professional"] },
  { id: "chikorita", label: "Chikorita", tags: ["Client-facing", "HR", "Marketing", "Soft accent"] },
  { id: "ditgar", label: "Ditgar", tags: ["Dark sidebar", "Data science", "Developer", "Modern"] },
  { id: "ditto", label: "Ditto", tags: ["ATS friendly", "Minimal", "Text-dense", "Traditional"] },
  { id: "gengar", label: "Gengar" },
  { id: "glalie", label: "Glalie" },
  { id: "kakuna", label: "Kakuna" },
  { id: "lapras", label: "Lapras" },
  { id: "leafish", label: "Leafish" },
  { id: "meowth", label: "Meowth" },
  { id: "onyx", label: "Onyx" },
  { id: "pikachu", label: "Pikachu" },
  { id: "rhyhorn", label: "Rhyhorn" },
  { id: "scizor", label: "Scizor" },
];

const DEFAULT_PDF_FORMAT = {
  marginMm: 14,
  lineH: 4.2,
  lineHSmall: 3.8,
  sectionGap: 5,
  fontSizeName: 16,
  fontSizeTitle: 10,
  fontSizeContact: 9,
  fontSizeLabel: 9,
  fontSizeBody: 10,
  fontSizeBullet: 9,
  photoWidthMm: 28,
  photoGapMm: 10,
  showDivider: true,
  dividerColor: "#c8d0da",
  fontHeader: "helvetica",
  fontBody: "helvetica",
  fontBullet: "helvetica",
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  skillsInHeader: false,
  singlePage: false,
  fontColor: "#000000",
  backgroundColor: "#ffffff",
};
const MM_TO_PX = 2.5;

function parseColor(hexOrRgb, fallbackR, fallbackG, fallbackB) {
  const def = { r: fallbackR ?? 0, g: fallbackG ?? 0, b: fallbackB ?? 0 };
  if (!hexOrRgb || typeof hexOrRgb !== "string") return def;
  const hex = hexOrRgb.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const m = hexOrRgb.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return def;
}

function parseDividerColor(hexOrRgb) {
  if (!hexOrRgb || typeof hexOrRgb !== "string") return { r: 200, g: 208, b: 218 };
  const hex = hexOrRgb.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = hexOrRgb.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 200, g: 208, b: 218 };
}

/**
 * Rebuild a PDF page's reading order from text positions. Design tools (Canva
 * etc.) store text in arbitrary order – a job's bullets can come before its
 * title line – so trusting the stored order files bullets under the wrong job.
 * Detects a column gutter (a vertical strip no text crosses), then reads each
 * column top-to-bottom, line by line.
 */
function pageTextInReadingOrder(items, pageWidth) {
  const words = items
    .filter((it) => typeof it.str === "string" && it.str.trim())
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width || 0,
      h: Math.abs(it.height || it.transform[3] || 10),
    }));
  if (!words.length) return "";

  // Coverage of each 2pt-wide vertical strip; full-width text (headers) is ignored so it can't hide a gutter.
  const step = 2;
  const coverage = new Array(Math.ceil(pageWidth / step) + 1).fill(0);
  words
    .filter((wd) => wd.w < pageWidth * 0.5)
    .forEach((wd) => {
      for (let x = Math.max(0, Math.floor(wd.x / step)); x <= Math.min(coverage.length - 1, Math.ceil((wd.x + wd.w) / step)); x++) coverage[x]++;
    });
  // Widest empty strip between 20% and 75% of the page width is the gutter.
  let best = null;
  let runStart = null;
  for (let i = 0; i <= coverage.length; i++) {
    const empty = i < coverage.length && coverage[i] === 0 && i * step > pageWidth * 0.2 && i * step < pageWidth * 0.75;
    if (empty && runStart === null) runStart = i;
    if (!empty && runStart !== null) {
      if (!best || i - runStart > best.len) best = { start: runStart, len: i - runStart };
      runStart = null;
    }
  }
  const gutterX = best && best.len * step >= 8 ? (best.start + best.len / 2) * step : null;

  const columns = gutterX == null ? [words] : [words.filter((wd) => wd.x < gutterX), words.filter((wd) => wd.x >= gutterX)];
  return columns
    .filter((col) => col.length)
    .map((col) => {
      // Group into lines (PDF y grows upward), then read lines top-to-bottom and words left-to-right.
      const sorted = [...col].sort((a, b) => b.y - a.y || a.x - b.x);
      const lines = [];
      for (const wd of sorted) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(line.y - wd.y) <= Math.max(2, Math.min(line.h, wd.h) * 0.5)) line.words.push(wd);
        else lines.push({ y: wd.y, h: wd.h, words: [wd] });
      }
      return lines
        .map((line) => line.words.sort((a, b) => a.x - b.x).map((wd) => wd.str).join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/**
 * Pull the profile photo out of an uploaded PDF resume as a PNG data URL, or
 * null. Walks page 1's drawing operations to find embedded images and their
 * on-page size, then picks the largest roughly-square one — skipping icons and
 * page-sized backgrounds. Uses the original image, so a photo the PDF clips to
 * a circle comes back whole.
 */
async function extractPdfPhoto(file) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await pdf.getPage(1);
    const { width: pageW, height: pageH } = page.getViewport({ scale: 1 });
    const { fnArray, argsArray } = await page.getOperatorList();
    const { OPS } = pdfjsLib;
    const multiply = (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const candidates = [];
    fnArray.forEach((fn, i) => {
      const args = argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = multiply(ctm, args);
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push(ctm);
        if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = multiply(ctm, args[0]);
      } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.paintImageXObject) {
        // Images are drawn into a unit square, so the matrix's column lengths are the on-page size.
        const w = Math.hypot(ctm[0], ctm[1]);
        const h = Math.hypot(ctm[2], ctm[3]);
        const share = (w * h) / (pageW * pageH);
        const ratio = w / h;
        if (share > 0.01 && share < 0.25 && ratio > 0.5 && ratio < 2) candidates.push({ name: args[0], area: w * h });
      }
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.area - a.area);
    const { name } = candidates[0];
    const store = name.startsWith("g_") ? page.commonObjs : page.objs;
    const img = await new Promise((resolve) => store.get(name, resolve));
    if (!img?.width || !img?.height) return null;

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (img.bitmap) {
      ctx.drawImage(img.bitmap, 0, 0);
    } else if (img.data) {
      // Raw pixels: kind 2 is RGB, 3 is RGBA (1-bit masks aren't photos).
      const rgba = new Uint8ClampedArray(img.width * img.height * 4);
      if (img.kind === 3) rgba.set(img.data.subarray(0, rgba.length));
      else if (img.kind === 2) {
        for (let p = 0, q = 0; q < rgba.length; p += 3, q += 4) {
          rgba[q] = img.data[p];
          rgba[q + 1] = img.data[p + 1];
          rgba[q + 2] = img.data[p + 2];
          rgba[q + 3] = 255;
        }
      } else return null;
      ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
    } else return null;
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("Could not extract photo from PDF:", e);
    return null;
  }
}

/**
 * Single-column resume PDF: photo top-left, name/title/contact to the right, then Summary, Experience, Education, Skills.
 * Uses format options so it matches the on-screen PDF preview.
 */
function downloadResumePdf(resumeData, photoDataUrl, format = DEFAULT_PDF_FORMAT) {
  if (!resumeData || typeof resumeData !== "object") return;
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const singlePage = format.singlePage === true;
  const scale = singlePage ? 0.78 : 1;
  let margin = (format.marginMm ?? 14) * scale;
  const hasPhoto = typeof photoDataUrl === "string" && photoDataUrl.length > 0;
  const photoGap = hasPhoto ? (format.photoGapMm ?? 10) * scale : 0;
  const photoW = hasPhoto ? (format.photoWidthMm ?? PHOTO_WIDTH_MM) * scale : 0;
  const photoH = Math.round(photoW * (4 / 3) * 10) / 10;
  const headerTextX = margin + photoW + photoGap;
  const contentW = pageW - margin * 2;
  const headerTextW = pageW - headerTextX - margin;
  let lineH = (format.lineH ?? 4.2) * scale;
  let lineHSmall = (format.lineHSmall ?? 3.8) * scale;
  let sectionGap = (format.sectionGap ?? 5) * scale;
  let y = margin;

  const bg = parseColor(format.backgroundColor, 255, 255, 255);
  doc.setFillColor(bg.r, bg.g, bg.b);
  doc.rect(0, 0, pageW, pageH, "F");

  doc.setCharSpace(0);
  doc.setFont("helvetica", "normal");

  const fc = parseColor(format.fontColor, 0, 0, 0);
  const fs = (v, d) => Math.max(1, ((v ?? d) * scale));
  const checkPage = (yVal) => {
    if (singlePage) return yVal;
    if (yVal > pageH - margin - 10) {
      doc.addPage();
      doc.setFillColor(bg.r, bg.g, bg.b);
      doc.rect(0, 0, pageW, pageH, "F");
      return margin;
    }
    return yVal;
  };

  const drawWrappedText = (text, x, maxWidth, lineHeight) => {
    doc.setCharSpace(0);
    const lines = doc.splitTextToSize(String(text || ""), maxWidth);
    lines.forEach((line) => {
      doc.text(line, x, y);
      y += lineHeight;
    });
  };

  const fontH = format.fontHeader || "helvetica";
  const fontB = format.fontBody || "helvetica";
  const fontBul = format.fontBullet || "helvetica";
  const bulletIndentMm = 4;
  const sectionOrder = Array.isArray(format.sectionOrder) && format.sectionOrder.length
    ? format.sectionOrder
    : DEFAULT_SECTION_ORDER;

  // —— Photo top-left ——
  if (hasPhoto) {
    try {
      doc.addImage(photoDataUrl, "PNG", margin, margin, photoW, photoH);
    } catch (e) {
      console.warn("PDF photo failed", e);
    }
  }

  // —— Name, title, contact: align name top with photo top (baseline = margin + ascent) ——
  const ascentMm = (format.fontSizeName ?? 16) * 0.3528 * scale;
  let yHeader = margin + ascentMm;
  doc.setFont(fontH, "bold");
  doc.setFontSize(fs(format.fontSizeName, 16));
  doc.setCharSpace(0);
  doc.setTextColor(fc.r, fc.g, fc.b);
  doc.text(resumeData.name || "Resume", headerTextX, yHeader);
  yHeader += 6;

  doc.setFont(fontB, "normal");
  doc.setFontSize(fs(format.fontSizeTitle, 10));
  doc.setCharSpace(0);
  const titleLines = doc.splitTextToSize(resumeData.title || "", headerTextW);
  titleLines.forEach((line) => {
    doc.text(line, headerTextX, yHeader);
    yHeader += lineHSmall;
  });
  yHeader += 3;

  doc.setFontSize(fs(format.fontSizeContact, 9));
  doc.setCharSpace(0);
  const contactLines = doc.splitTextToSize(resumeData.contact || "", headerTextW);
  contactLines.forEach((line) => {
    doc.text(line, headerTextX, yHeader);
    yHeader += lineHSmall;
  });

  if (format.skillsInHeader && (resumeData.skills || []).length > 0) {
    yHeader += lineHSmall;
    doc.setFont(fontB, "normal");
    doc.setFontSize(fs(format.fontSizeBody, 10));
    doc.setCharSpace(0);
    doc.setTextColor(fc.r, fc.g, fc.b);
    const skillLines = doc.splitTextToSize((resumeData.skills || []).join(" | "), headerTextW);
    skillLines.forEach((line) => {
      doc.text(line, headerTextX, yHeader);
      yHeader += lineHSmall;
    });
    doc.setTextColor(fc.r, fc.g, fc.b);
  }

  y = Math.max(margin + photoH, yHeader) + 5;
  if (format.showDivider !== false) {
    const dc = parseDividerColor(format.dividerColor);
    doc.setDrawColor(dc.r, dc.g, dc.b);
    doc.setLineWidth(0.3);
    doc.line(margin, y - 1, pageW - margin, y - 1);
  }
  y += 3;

  const bodySectionOrder = format.skillsInHeader
    ? sectionOrder.filter((k) => k !== "skills")
    : sectionOrder;

  const renderSection = (key) => {
    if (key === "summary") {
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("SUMMARY", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      if (resumeData.summary) {
        drawWrappedText(resumeData.summary, margin, contentW, lineHSmall);
      }
      return;
    }
    if (key === "experience") {
      y = checkPage(y);
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("EXPERIENCE", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      (resumeData.experience || []).forEach((exp) => {
        y = checkPage(y);
        doc.setFont(fontB, "bold");
        doc.setFontSize(fs(format.fontSizeBody, 10));
        doc.setCharSpace(0);
        doc.text(`${exp.role || ""} · ${exp.company || ""}`, margin, y);
        y += lineHSmall;
        doc.setFont(fontBul, "normal");
        doc.setFontSize(fs(format.fontSizeBullet, 9));
        doc.setCharSpace(0);
        if (exp.period) {
          doc.text(exp.period, margin, y);
          y += lineHSmall;
        }
        (exp.bullets || []).slice(0, MAX_BULLETS_PER_EXPERIENCE).forEach((b) => {
          y = checkPage(y);
          const textW = contentW - bulletIndentMm - 2;
          const lines = doc.splitTextToSize(String(b), textW);
          const bulletPrefix = "• ";
          doc.text(bulletPrefix, margin, y);
          const textX = margin + bulletIndentMm;
          if (lines.length) {
            doc.text(lines[0], textX, y);
            y += lineHSmall;
            for (let i = 1; i < lines.length; i++) {
              y = checkPage(y);
              doc.text(lines[i], textX, y);
              y += lineHSmall;
            }
          }
        });
        y += lineHSmall;
      });
      return;
    }
    if (key === "education") {
      y = checkPage(y);
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("EDUCATION", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      (resumeData.education || []).forEach((ed) => {
        y = checkPage(y);
        doc.text(`${ed.degree || ""} · ${ed.school || ""} · ${ed.year || ""}`, margin, y);
        y += lineHSmall + 1;
      });
      return;
    }
    if (key === "skills") {
      y = checkPage(y);
      doc.setFont(fontH, "bold");
      doc.setFontSize(fs(format.fontSizeLabel, 9));
      doc.setCharSpace(0);
      doc.setTextColor(90, 107, 138);
      doc.text("SKILLS", margin, y);
      doc.setTextColor(fc.r, fc.g, fc.b);
      y += lineH;
      doc.setFont(fontB, "normal");
      doc.setFontSize(fs(format.fontSizeBody, 10));
      const skills = resumeData.skills || [];
      if (skills.length) {
        drawWrappedText(skills.join(" · "), margin, contentW, lineHSmall);
      }
    }
  };

  bodySectionOrder.forEach((key, i) => {
    renderSection(key);
    if (i < bodySectionOrder.length - 1) y += sectionGap;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("ResumeIQ", margin, pageH - 6);
  doc.setTextColor(0, 0, 0);

  const safeName = (resumeData.name || "resume").replace(/[^a-z0-9-_]/gi, "_").slice(0, 40);
  doc.save(`${safeName}_resume.pdf`);
}

const FONT_FAMILY_MAP = { helvetica: "Helvetica, Arial", times: "Times New Roman, serif", courier: "Courier New, monospace" };

/**
 * Live preview of how the PDF will look. Uses same layout and format values as downloadResumePdf.
 */
function PdfStylePreview({ resume, format }) {
  if (!resume || typeof resume !== "object") return null;
  const m = (mm) => mm * MM_TO_PX;
  const pt = (v) => `${v}pt`;
  const pageWidth = m(210);
  const pageHeight = m(297);
  const margin = m(format.marginMm);
  const hasPhoto = !!resume.photoUrl;
  const photoW = hasPhoto ? m(format.photoWidthMm) : 0;
  const photoH = m(format.photoWidthMm * (4 / 3));
  const photoGap = hasPhoto ? m(format.photoGapMm) : 0;
  const headerX = margin + photoW + photoGap;
  const contentW = pageWidth - margin * 2;
  const headerW = pageWidth - headerX - margin;
  const lineH = m(format.lineHSmall);
  const sectionGap = m(format.sectionGap);
  const bulletIndentPx = m(4);
  const labelColor = "rgb(90,107,138)";
  const dividerColor = format.dividerColor && format.showDivider !== false
    ? (format.dividerColor.trim().match(/^#?[0-9a-fA-F]{6}$/) ? format.dividerColor : "rgb(200,208,218)")
    : "transparent";
  const fontH = FONT_FAMILY_MAP[format.fontHeader] || FONT_FAMILY_MAP.helvetica;
  const fontB = FONT_FAMILY_MAP[format.fontBody] || FONT_FAMILY_MAP.helvetica;
  const fontBul = FONT_FAMILY_MAP[format.fontBullet] || FONT_FAMILY_MAP.helvetica;
  const sectionOrder = Array.isArray(format.sectionOrder) && format.sectionOrder.length
    ? format.sectionOrder
    : DEFAULT_SECTION_ORDER;
  const bodySectionOrder = format.skillsInHeader ? sectionOrder.filter((k) => k !== "skills") : sectionOrder;

  const wrap = (text, maxChars) => {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((w) => {
      if (line.length + w.length + 1 <= maxChars) line += (line ? " " : "") + w;
      else { if (line) lines.push(line); line = w; }
    });
    if (line) lines.push(line);
    return lines;
  };

  const maxChars = (widthPx) => Math.floor((widthPx / 5.5) * 2.2);
  const ascentPx = (format.fontSizeName ?? 16) * 0.3528 * MM_TO_PX;

  const bgColor = format.backgroundColor || "#ffffff";
  const textColor = format.fontColor || "#000000";

  return (
    <div
      style={{
        width: pageWidth,
        minHeight: pageHeight,
        background: bgColor,
        color: textColor,
        fontFamily: fontB,
        fontSize: pt(format.fontSizeBody),
        padding: margin,
        boxSizing: "border-box",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        borderRadius: 4,
      }}
    >
      <div style={{ display: "flex", gap: photoGap, alignItems: "flex-start" }}>
        {hasPhoto && (
          <img
            src={resume.photoUrl}
            alt=""
            style={{
              width: photoW,
              height: photoH,
              objectFit: "cover",
              borderRadius: 4,
              flexShrink: 0,
            }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, maxWidth: headerW, paddingTop: ascentPx }}>
          <div
            style={{
              fontFamily: fontH,
              fontWeight: 700,
              fontSize: pt(format.fontSizeName),
              marginBottom: m(1.5),
            }}
          >
            {resume.name}
          </div>
          <div style={{ fontFamily: fontB, fontSize: pt(format.fontSizeTitle), marginBottom: m(1), lineHeight: 1.3 }}>
            {(resume.title || "").split(/\s+/).reduce((acc, w) => {
              const last = acc[acc.length - 1] || "";
              if (last.length + w.length + 1 <= maxChars(headerW)) acc[acc.length - 1] = (last + (last ? " " : "") + w);
              else acc.push(w);
              return acc;
            }, [""]).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          <div style={{ fontFamily: fontB, fontSize: pt(format.fontSizeContact), color: "#444", lineHeight: 1.35 }}>
            {wrap(resume.contact || "", maxChars(headerW)).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
          {format.skillsInHeader && (resume.skills || []).length > 0 && (
            <div style={{ fontFamily: fontB, fontSize: pt(format.fontSizeBody), lineHeight: 1.35, marginTop: m(2), color: format.fontColor || "#000" }}>
              {(resume.skills || []).join(" | ")}
            </div>
          )}
        </div>
      </div>

      {format.showDivider !== false && (
        <div
          style={{
            marginTop: m(4),
            marginBottom: m(3),
            borderBottom: `1px solid ${dividerColor}`,
          }}
        />
      )}

      {bodySectionOrder.map((key, idx) => {
        const isLast = idx === bodySectionOrder.length - 1;
        const blockMargin = isLast ? 0 : sectionGap;
        if (key === "summary") {
          return (
            <div key="summary" style={{ marginBottom: blockMargin }}>
              <div style={{ fontFamily: fontH, fontWeight: 700, fontSize: pt(format.fontSizeLabel), color: labelColor, marginBottom: m(1) }}>
                SUMMARY
              </div>
              <div style={{ fontFamily: fontB, fontSize: pt(format.fontSizeBody), lineHeight: 1.4 }}>
                {wrap(resume.summary || "", maxChars(contentW)).map((line, i) => (
                  <div key={i} style={{ marginBottom: lineH / 2 }}>{line}</div>
                ))}
              </div>
            </div>
          );
        }
        if (key === "experience") {
          return (
            <div key="experience" style={{ marginBottom: blockMargin }}>
              <div style={{ fontFamily: fontH, fontWeight: 700, fontSize: pt(format.fontSizeLabel), color: labelColor, marginBottom: m(1) }}>
                EXPERIENCE
              </div>
              {(resume.experience || []).map((exp, idx) => (
                <div key={idx} style={{ marginBottom: sectionGap * 0.8 }}>
                  <div style={{ fontFamily: fontB, fontWeight: 700, fontSize: pt(format.fontSizeBody) }}>
                    {exp.role} · {exp.company}
                  </div>
                  {exp.period && (
                    <div style={{ fontFamily: fontBul, fontSize: pt(format.fontSizeBullet), color: "#444", marginBottom: m(0.5) }}>
                      {exp.period}
                    </div>
                  )}
                  {(exp.bullets || []).slice(0, MAX_BULLETS_PER_EXPERIENCE).map((b, i) => (
                    <div
                      key={i}
                      style={{
                        fontFamily: fontBul,
                        fontSize: pt(format.fontSizeBullet),
                        lineHeight: 1.35,
                        marginBottom: lineH * 0.5,
                        paddingLeft: bulletIndentPx,
                        textIndent: -bulletIndentPx,
                        maxWidth: contentW,
                      }}
                    >
                      <span style={{ display: "inline-block", width: bulletIndentPx }}>• </span>
                      {b}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        }
        if (key === "education") {
          return (
            <div key="education" style={{ marginBottom: blockMargin }}>
              <div style={{ fontFamily: fontH, fontWeight: 700, fontSize: pt(format.fontSizeLabel), color: labelColor, marginBottom: m(1) }}>
                EDUCATION
              </div>
              {(resume.education || []).map((ed, idx) => (
                <div key={idx} style={{ fontFamily: fontB, fontSize: pt(format.fontSizeBody), marginBottom: lineH * 0.6 }}>
                  {ed.degree} · {ed.school} · {ed.year}
                </div>
              ))}
            </div>
          );
        }
        if (key === "skills") {
          return (
            <div key="skills" style={{ marginBottom: blockMargin }}>
              <div style={{ fontFamily: fontH, fontWeight: 700, fontSize: pt(format.fontSizeLabel), color: labelColor, marginBottom: m(1) }}>
                SKILLS
              </div>
              <div style={{ fontFamily: fontB, fontSize: pt(format.fontSizeBody), lineHeight: 1.4 }}>
                {(resume.skills || []).join(" · ")}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/** Split text by highlight phrases and return array of React nodes (text + highlighted spans). */
function renderWithHighlights(text, highlightPhrases, highlightStyle) {
  if (!text || typeof text !== "string") return null;
  const phrases = (highlightPhrases || []).filter((p) => p && typeof p === "string" && p.length > 0);
  if (!phrases.length) return text;

  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  let segments = [{ type: "text", value: text }];

  for (const phrase of sorted) {
    const next = [];
    for (const seg of segments) {
      if (seg.type === "highlight") {
        next.push(seg);
        continue;
      }
      const parts = seg.value.split(phrase);
      if (parts.length === 1) {
        next.push(seg);
        continue;
      }
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) next.push({ type: "text", value: parts[i] });
        if (i < parts.length - 1) next.push({ type: "highlight", value: phrase });
      }
    }
    segments = next;
  }

  return segments.map((seg, i) =>
    seg.type === "highlight" ? (
      <span key={i} style={highlightStyle}>{seg.value}</span>
    ) : (
      seg.value
    )
  );
}

/** Click-to-edit text bound to `value`; commits via `onCommit` on blur (not per keystroke, to avoid cursor jumps). */
function EditableText({ value, onCommit, as: Tag = "div", style, multiline = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.textContent !== (value || "")) {
      ref.current.textContent = value || "";
    }
  }, [value]);
  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="rq-editable"
      style={{ ...style, minWidth: 20, minHeight: multiline ? "1.4em" : undefined, whiteSpace: multiline ? "pre-wrap" : undefined }}
      onBlur={(e) => onCommit(e.currentTarget.textContent || "")}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

let assistantEditSeq = 0;

/**
 * Conversational tailoring: the assistant diagnoses fit against the JD, asks
 * for missing facts, and proposes one checked edit at a time (server/assistant.js).
 * Chat state lives in the parent so it survives moving to the preview and back.
 */
function TailoringAssistant({ job, resume, chat, setChat, onAccept }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, loading]);

  const sendTurn = async (nextChat) => {
    setLoading(true);
    setError(null);
    try {
      const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
      const response = await fetch(`${base}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: resumeForAI(resume),
          job: { role: job.role, company: job.company, jd: job.jd },
          messages: nextChat.messages.filter((m) => m.role !== "note").map((m) => ({ role: m.role, content: m.text })),
          decisions: nextChat.decisions,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Assistant request failed (${response.status})`);
      const edits = (data.edits || []).map((e) => ({ ...e, id: `a${Date.now()}-${++assistantEditSeq}`, status: "pending" }));
      setChat((c) => ({
        ...c,
        messages: [...c.messages, { role: "assistant", text: data.message, edits, quickReplies: data.quickReplies || [], done: !!data.done }],
      }));
    } catch (e) {
      setError(e.message || "The assistant is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startedRef.current || chat.messages.length) return;
    startedRef.current = true;
    sendTurn(chat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendUserText = (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const nextChat = { ...chat, messages: [...chat.messages, { role: "user", text: trimmed }] };
    setChat(nextChat);
    setInput("");
    sendTurn(nextChat);
  };

  const decide = (messageIndex, editId, decision) => {
    const message = chat.messages[messageIndex];
    const edit = message.edits.find((e) => e.id === editId);
    if (!edit || edit.status !== "pending") return;
    if (decision === "accepted") onAccept(edit);
    const edits = message.edits.map((e) => (e.id === editId ? { ...e, status: decision } : e));
    const messages = chat.messages.map((m, i) => (i === messageIndex ? { ...m, edits } : m));
    const decisions = [...chat.decisions, { decision, section: edit.section, original: edit.original, proposed: edit.proposed }];
    let nextChat = { ...chat, messages, decisions };
    // Once every edit in this message is decided, move the conversation on.
    if (edits.every((e) => e.status !== "pending")) {
      const accepted = edits.filter((e) => e.status === "accepted").length;
      const summary = accepted === edits.length ? "I accepted the edit." : accepted ? "I accepted some of the edits and rejected the rest." : "I rejected that edit.";
      nextChat = { ...nextChat, messages: [...nextChat.messages, { role: "user", text: summary, isDecision: true }] };
      setChat(nextChat);
      sendTurn(nextChat);
    } else {
      setChat(nextChat);
    }
  };

  const updateProposed = (messageIndex, editId, proposed) => {
    setChat((c) => ({
      ...c,
      messages: c.messages.map((m, i) =>
        i === messageIndex ? { ...m, edits: m.edits.map((e) => (e.id === editId ? { ...e, proposed } : e)) } : m
      ),
    }));
  };

  const last = chat.messages[chat.messages.length - 1];
  const awaitingDecision = last?.role === "assistant" && last.edits?.some((e) => e.status === "pending");

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", height: "min(640px, calc(100vh - 120px))", minHeight: 420 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "#8b8ba7" }}>
        <span style={{ color: "#00e5a0", fontWeight: 600 }}>Tailoring assistant</span> · Every edit is checked: it keeps your specifics and adds nothing you haven't confirmed.
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14, maskImage: "linear-gradient(to bottom, transparent 0, #000 32px)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 32px)" }}>
        {chat.messages.map((m, mi) =>
          m.role === "user" ? (
            m.isDecision ? (
              <div key={mi} style={{ alignSelf: "center", fontSize: 11, color: "#6b6b85", fontFamily: "'DM Mono', monospace" }}>{m.text}</div>
            ) : (
              <div key={mi} style={{ alignSelf: "flex-end", maxWidth: "80%", background: "rgba(0,229,160,0.12)", border: "1px solid rgba(0,229,160,0.25)", borderRadius: "12px 12px 2px 12px", padding: "8px 12px", fontSize: 13, color: "#e6e6f0", whiteSpace: "pre-wrap" }}>
                {m.text}
              </div>
            )
          ) : (
            <div key={mi} style={{ alignSelf: "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: "12px 12px 12px 2px", padding: "10px 14px", fontSize: 13, lineHeight: 1.55, color: "#e6e6f0", whiteSpace: "pre-wrap" }}>
                {m.text}
              </div>
              {(m.edits || []).map((e) => (
                <div key={e.id} style={{ border: `1px solid ${e.status === "accepted" ? "rgba(0,229,160,0.45)" : e.status === "rejected" ? "rgba(255,95,95,0.3)" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, padding: 12, background: "rgba(0,0,0,0.25)", opacity: e.status === "rejected" ? 0.55 : 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={styles.sectionPill}>{e.section}{e.section === "Experience" && resume.experience?.[e.experienceIndex] ? ` · ${resume.experience[e.experienceIndex].company}` : ""}</div>
                    <div style={styles.typePill}>{e.type}</div>
                    {e.status !== "pending" && (
                      <span style={{ fontSize: 11, color: e.status === "accepted" ? "#00e5a0" : "#ff5f5f", fontFamily: "'DM Mono', monospace" }}>
                        {e.status === "accepted" ? "✓ Applied" : "✕ Rejected"}
                      </span>
                    )}
                  </div>
                  {e.jdRequirement && (
                    <div style={{ fontSize: 11, color: "#8b8ba7", marginBottom: 8 }}>
                      Targets: <span style={{ color: "#c9c9dc" }}>{e.jdRequirement}</span>
                    </div>
                  )}
                  {e.original && (
                    <div style={{ fontSize: 12.5, color: "#ff8f8f", textDecoration: e.type === "Removal" ? "line-through" : "none", background: "rgba(255,95,95,0.06)", borderRadius: 6, padding: "6px 8px", marginBottom: 6 }}>
                      {e.original}
                    </div>
                  )}
                  {e.type !== "Removal" && (
                    e.status === "pending" ? (
                      <DiffTextarea
                        original={e.original}
                        value={e.proposed}
                        onChange={(v) => updateProposed(mi, e.id, v)}
                      />
                    ) : (
                      <div style={{ fontSize: 12.5, color: "#c9c9dc", background: "rgba(0,229,160,0.06)", borderRadius: 6, padding: "6px 8px", whiteSpace: "pre-wrap" }}>
                        <DiffText original={e.original} text={e.proposed} />
                      </div>
                    )
                  )}
                  {e.why && <div style={{ ...styles.whyLine, marginTop: 8 }}>💡 {e.why}</div>}
                  {e.status === "pending" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                      <button type="button" style={styles.dangerButton} disabled={loading} onClick={() => decide(mi, e.id, "rejected")}>✕ Reject</button>
                      <button type="button" style={styles.successButton} disabled={loading} onClick={() => decide(mi, e.id, "accepted")}>✓ Accept</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
        {loading && <div style={{ alignSelf: "flex-start", fontSize: 12, color: "#8b8ba7", fontFamily: "'DM Mono', monospace" }}>Assistant is thinking…</div>}
        {error && (
          <div style={{ alignSelf: "stretch", fontSize: 12, color: "#ff8f8f", background: "rgba(255,95,95,0.08)", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{error}</span>
            <button type="button" style={styles.ghostButton} onClick={() => sendTurn(chat)}>Retry</button>
          </div>
        )}
      </div>
      {last?.role === "assistant" && !loading && !awaitingDecision && last.quickReplies?.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 16px 10px" }}>
          {last.quickReplies.map((q) => (
            <button key={q} type="button" onClick={() => sendUserText(q)} style={{ ...styles.ghostButton, fontSize: 12, padding: "5px 10px" }}>{q}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendUserText(input); } }}
          placeholder={awaitingDecision ? "Accept or reject the edit above, or tell the assistant what to change…" : "Answer the question, add a fact, or ask for a change…"}
          disabled={loading}
          style={{ ...styles.input, flex: 1 }}
        />
        <button type="button" onClick={() => sendUserText(input)} disabled={loading || !input.trim()} style={{ ...styles.primaryButton, ...(loading || !input.trim() ? styles.disabledButton : {}) }}>
          Send
        </button>
      </div>
    </div>
  );
}

// Word-level diff: marks each token of `text` that isn't carried over from `original`.
// Words are compared ignoring case and surrounding punctuation; whitespace is kept as-is.
function diffAddedWords(original, text) {
  const norm = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const tokens = (text || "").split(/(\s+)/).filter(Boolean);
  const a = (original || "").split(/\s+/).filter(Boolean).map(norm);
  const words = [];
  tokens.forEach((t, i) => { if (!/^\s+$/.test(t)) words.push(i); });
  const b = words.map((i) => norm(tokens[i]));
  // LCS table over words.
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added = new Set();
  let i = 0, j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) { i++; j++; }
    else if (i < a.length && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else { added.add(words[j]); j++; }
  }
  return tokens.map((t, k) => ({ text: t, added: added.has(k) }));
}

const addedWordStyle = { color: "#00e5a0", background: "rgba(0,229,160,0.16)", borderRadius: 3 };

function DiffText({ original, text }) {
  if (!original) return <span style={addedWordStyle}>{text}</span>;
  return diffAddedWords(original, text).map((t, k) => (t.added ? <span key={k} style={addedWordStyle}>{t.text}</span> : t.text));
}

// Editable textarea that shows words added relative to `original` in a different color.
// A highlighted copy of the text sits behind a transparent textarea with identical metrics.
function DiffTextarea({ original, value, onChange }) {
  const backdropRef = useRef(null);
  const metrics = { padding: 8, border: "1px solid transparent", fontSize: 12.5, lineHeight: 1.5, fontFamily: "inherit", whiteSpace: "pre-wrap", overflowWrap: "break-word", boxSizing: "border-box", width: "100%", margin: 0, letterSpacing: "normal" };
  return (
    <div style={{ position: "relative", borderRadius: 6, background: "rgba(0,229,160,0.06)" }}>
      <div ref={backdropRef} aria-hidden style={{ ...metrics, position: "absolute", inset: 0, overflow: "hidden", color: "#c9c9dc", pointerEvents: "none" }}>
        <DiffText original={original} text={value} />
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        onScroll={(ev) => { if (backdropRef.current) backdropRef.current.scrollTop = ev.target.scrollTop; }}
        rows={4}
        style={{ ...metrics, display: "block", position: "relative", borderRadius: 6, border: "1px solid rgba(0,229,160,0.4)", background: "transparent", color: "transparent", caretColor: "#fff", resize: "vertical" }}
      />
    </div>
  );
}

function ResumeDocument({ resume, highlights = [], dim = false, afterMode = false, editable = false, onEdit }) {
  if (!resume || typeof resume !== "object") {
    return (
      <div style={{ ...styles.resumePaper, opacity: dim ? 0.55 : 1, color: "#888" }}>
        No resume data to display.
      </div>
    );
  }
  const highlightPhrases = Array.isArray(highlights) ? highlights : [];
  const highlightStyle = afterMode
    ? styles.resumeHighlightAfter
    : styles.resumeHighlight;

  const wrapMaybe = (text) => {
    if (!text) return null;
    if (highlightPhrases.length > 0) {
      return renderWithHighlights(String(text), highlightPhrases, highlightStyle);
    }
    return text;
  };

  const photoUrl = resume.photoUrl || null;

  if (!editable) {
    return (
      <div style={{ ...styles.resumePaper, opacity: dim ? 0.55 : 1 }}>
        <div style={styles.resumeHeaderRow}>
          {photoUrl && (
            <img
              src={photoUrl}
              alt=""
              style={styles.resumePhoto}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <div style={styles.resumeHeaderText}>
            <div style={styles.resumeNameText}>{resume.name}</div>
            <div style={styles.resumeTitleText}>{resume.title}</div>
            <div style={styles.resumeContactText}>{resume.contact}</div>
          </div>
        </div>
        <hr style={styles.resumeHr} />
        <div style={styles.resumeSectionTitle}>Summary</div>
        <div style={styles.resumeBodyText}>{wrapMaybe(resume.summary)}</div>

        <div style={styles.resumeSectionTitle}>Experience</div>
        {(resume.experience || []).map((exp, idx) => (
          <div key={idx}>
            <div style={styles.resumeExpHeaderRow}>
              <div style={styles.resumeExpTitle}>
                {exp.role} · {exp.company}
              </div>
              <div style={styles.resumeExpPeriod}>{exp.period}</div>
            </div>
            <ul style={styles.resumeBullets}>
              {(exp.bullets || []).map((b, i) => (
                <li key={i} style={styles.resumeBullet}>
                  {wrapMaybe(b)}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div style={styles.resumeSectionTitle}>Education</div>
        {(resume.education || []).map((ed, idx) => (
          <div key={idx} style={styles.resumeEducationRow}>
            <strong>{ed.degree}</strong> · {ed.school} · {ed.year}
          </div>
        ))}

        <div style={styles.resumeSectionTitle}>Skills</div>
        <div style={styles.resumeSkillsWrap}>
          {(resume.skills || []).map((s, idx) => (
            <div key={idx} style={styles.resumeSkillChip}>
              {wrapMaybe(s)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Editable (WYSIWYG) rendering: same visual layout, but every field is click-to-edit in place.
  return (
    <div style={{ ...styles.resumePaper, opacity: dim ? 0.55 : 1 }}>
      <div style={styles.resumeHeaderRow}>
        {photoUrl && (
          <img
            src={photoUrl}
            alt=""
            style={styles.resumePhoto}
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        <div style={styles.resumeHeaderText}>
          <EditableText value={resume.name} onCommit={onEdit.updateName} style={styles.resumeNameText} />
          <EditableText value={resume.title} onCommit={onEdit.updateTitle} style={styles.resumeTitleText} />
          <EditableText value={resume.contact} onCommit={onEdit.updateContact} style={styles.resumeContactText} />
        </div>
      </div>
      <hr style={styles.resumeHr} />
      <div style={styles.resumeSectionTitle}>Summary</div>
      <EditableText value={resume.summary} onCommit={onEdit.updateSummary} style={styles.resumeBodyText} multiline />

      <div style={styles.resumeSectionTitle}>Experience</div>
      {(resume.experience || []).map((exp, idx) => (
        <div key={idx} className="rq-editable-row" style={{ marginBottom: 6 }}>
          <div style={styles.resumeExpHeaderRow}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, flex: 1 }}>
              <EditableText value={exp.role} onCommit={(v) => onEdit.updateExpField(idx, "role", v)} style={styles.resumeExpTitle} />
              <span style={styles.resumeExpTitle}>·</span>
              <EditableText value={exp.company} onCommit={(v) => onEdit.updateExpField(idx, "company", v)} style={styles.resumeExpTitle} />
            </div>
            <EditableText value={exp.period} onCommit={(v) => onEdit.updateExpField(idx, "period", v)} style={styles.resumeExpPeriod} />
            <button type="button" className="rq-remove-btn" title="Remove role" onClick={() => onEdit.removeExperience(idx)}>×</button>
          </div>
          <ul style={styles.resumeBullets}>
            {(exp.bullets || []).map((b, i) => (
              <li key={i} className="rq-editable-row" style={{ ...styles.resumeBullet, display: "flex", alignItems: "flex-start", gap: 4 }}>
                <EditableText value={b} onCommit={(v) => onEdit.updateBullet(idx, i, v)} style={{ flex: 1 }} multiline />
                <button type="button" className="rq-remove-btn" title="Remove bullet" onClick={() => onEdit.removeBullet(idx, i)}>×</button>
              </li>
            ))}
          </ul>
          <button type="button" className="rq-add-btn" onClick={() => onEdit.addBullet(idx)}>+ Add bullet</button>
        </div>
      ))}
      <button type="button" className="rq-add-btn" onClick={onEdit.addExperience}>+ Add role</button>

      <div style={styles.resumeSectionTitle}>Education</div>
      {(resume.education || []).map((ed, idx) => (
        <div key={idx} className="rq-editable-row" style={{ ...styles.resumeEducationRow, display: "flex", alignItems: "baseline", gap: 4 }}>
          <EditableText value={ed.degree} onCommit={(v) => onEdit.updateEduField(idx, "degree", v)} style={{ fontWeight: 700 }} />
          <span>·</span>
          <EditableText value={ed.school} onCommit={(v) => onEdit.updateEduField(idx, "school", v)} />
          <span>·</span>
          <EditableText value={ed.year} onCommit={(v) => onEdit.updateEduField(idx, "year", v)} />
          <button type="button" className="rq-remove-btn" title="Remove education" onClick={() => onEdit.removeEducation(idx)}>×</button>
        </div>
      ))}
      <button type="button" className="rq-add-btn" onClick={onEdit.addEducation}>+ Add education</button>

      <div style={styles.resumeSectionTitle}>Skills</div>
      <div style={styles.resumeSkillsWrap}>
        {(resume.skills || []).map((s, idx) => (
          <div key={idx} className="rq-editable-row" style={{ ...styles.resumeSkillChip, display: "flex", alignItems: "center", gap: 4 }}>
            <EditableText value={s} onCommit={(v) => onEdit.updateSkill(idx, v)} style={{ minWidth: 10 }} />
            <button type="button" className="rq-remove-btn" title="Remove skill" onClick={() => onEdit.removeSkill(idx)}>×</button>
          </div>
        ))}
        <button type="button" className="rq-add-btn" onClick={onEdit.addSkill}>+ Add skill</button>
      </div>
    </div>
  );
}

const DEFAULT_PARSING_STATUS = { extractText: false, parseStructure: false, findJobs: false };

export default function ResumeIQ() {
  const [step, setStep] = useState("upload");
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef(jobs);
  const searchIdRef = useRef(0);
  const lastSearchKeyRef = useRef("");
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [expandedJob, setExpandedJob] = useState(null);
  const [jobSummary, setJobSummary] = useState(null);
  const [jobSummaryLoading, setJobSummaryLoading] = useState(false);
  const [showFullJd, setShowFullJd] = useState(false);
  const jobSummaryCacheRef = useRef(new Map());
  const [resume, setResume] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [extractingResume, setExtractingResume] = useState(false);
  const [readingPdf, setReadingPdf] = useState(false);
  const [linkedInText, setLinkedInText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [linkedInSearchKeywords, setLinkedInSearchKeywords] = useState("Product Manager");
  const [suggestedRoles, setSuggestedRoles] = useState([]);
  const [candidateYears, setCandidateYears] = useState("");
  const [showBelowLevelJobs, setShowBelowLevelJobs] = useState(false);
  // { keywords, savedCount, freshCount } for the current search; freshCount is null until LinkedIn returns.
  const [jobFeedStatus, setJobFeedStatus] = useState(null);
  const [linkedInSearchLocation, setLinkedInSearchLocation] = useState("India");
  const [linkedInSearchIndiaOnly, setLinkedInSearchIndiaOnly] = useState(true);
  const [linkedInSearchLimit, setLinkedInSearchLimit] = useState(100);
  const [linkedInSearching, setLinkedInSearching] = useState(false);
  const [linkedInSearchError, setLinkedInSearchError] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileSize, setUploadedFileSize] = useState("");
  const [parsingStatus, setParsingStatus] = useState(() => ({ ...DEFAULT_PARSING_STATUS }));
  const [parsingError, setParsingError] = useState(null);
  const [dropZoneHover, setDropZoneHover] = useState(false);
  const fileInputRef = useRef(null);
  const [score, setScore] = useState(null);
  const [scoreBreakdown, setScoreBreakdown] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [approvedIds, setApprovedIds] = useState(() => new Set());
  const [updatedResume, setUpdatedResume] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [hoveredJobId, setHoveredJobId] = useState(null);
  const [pdfFormat, setPdfFormat] = useState(() => ({ ...DEFAULT_PDF_FORMAT }));
  // Tailoring assistant conversation for the selected job: { messages, decisions }.
  const [assistantChat, setAssistantChat] = useState({ messages: [], decisions: [] });
  const [openingInBuilder, setOpeningInBuilder] = useState(false);
  const [openInBuilderError, setOpenInBuilderError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templatePdfUrl, setTemplatePdfUrl] = useState(null);
  const [renderingTemplate, setRenderingTemplate] = useState(false);
  const [templateRenderError, setTemplateRenderError] = useState(null);
  const templatePdfUrlRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  useEffect(() => {
    if (!expandedJob) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setExpandedJob(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedJob]);

  useEffect(() => {
    setShowFullJd(false);
    if (!expandedJob) {
      setJobSummary(null);
      setJobSummaryLoading(false);
      return;
    }
    const cached = jobSummaryCacheRef.current.get(expandedJob.id);
    if (cached) {
      setJobSummary(cached);
      setJobSummaryLoading(false);
      return;
    }
    let cancelled = false;
    setJobSummary(null);
    setJobSummaryLoading(true);
    summarizeJobPosting(expandedJob)
      .then((summary) => {
        if (cancelled) return;
        jobSummaryCacheRef.current.set(expandedJob.id, summary);
        setJobSummary(summary);
      })
      .finally(() => {
        if (!cancelled) setJobSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedJob]);

  const jobMatchScores = useMemo(() => {
    const resumeForMatch = resume || SAMPLE_RESUME;
    const map = new Map();
    jobs.forEach((job) => {
      map.set(job.id, computeLocalMatchScore(resumeForMatch, job));
    });
    return map;
  }, [jobs, resume]);

  const [jobSortBy, setJobSortBy] = useState("match");

  const yearsNum = Number(candidateYears) || null;
  const belowLevelJobIds = useMemo(
    () => new Set(jobs.filter((job) => isBelowCandidateLevel(job, yearsNum)).map((job) => job.id)),
    [jobs, yearsNum]
  );

  const sortedJobs = useMemo(() => {
    const list = showBelowLevelJobs ? [...jobs] : jobs.filter((job) => !belowLevelJobIds.has(job.id));
    if (jobSortBy === "match") {
      list.sort((a, b) => (jobMatchScores.get(b.id)?.score ?? 0) - (jobMatchScores.get(a.id)?.score ?? 0));
    } else if (jobSortBy === "company") {
      list.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
    }
    return list;
  }, [jobs, jobSortBy, jobMatchScores, showBelowLevelJobs, belowLevelJobIds]);

  const handleJobAnalyzeClick = (job) => {
    setSelectedJob(job);
    setStep("suggestions");
    setScore(null);
    setScoreBreakdown(null);
    setSuggestions([]);
    setAssistantChat({ messages: [], decisions: [] });
    setApprovedIds(new Set());
    scoreAgainstJob(job);
  };

  const handleExtractJob = async () => {
    if (!linkedInText.trim()) return;
    setExtracting(true);
    try {
      const jobData = await extractLinkedInJob(linkedInText.trim());
      const newJob = {
        id: `linkedin-${Date.now()}`,
        company: jobData.company,
        role: jobData.role,
        location: jobData.location,
        salary: jobData.salary,
        badge: jobData.badge,
        jd: jobData.jd,
        source: "linkedin",
      };
      setJobs((prev) => [newJob, ...prev]);
      setLinkedInText("");
    } catch (e) {
      console.error("Error extracting job:", e);
    } finally {
      setExtracting(false);
    }
  };

  /**
   * Merge jobs into the grid by id. Roles already shown get their fields
   * refreshed; with markFresh, roles not shown before are badged "Just in".
   * Returns how many were added.
   */
  const mergeJobs = (incoming, { markFresh = false } = {}) => {
    const shownIds = new Set(jobsRef.current.map((job) => job.id));
    const addedCount = new Set(incoming.map((job) => job.id).filter((id) => !shownIds.has(id))).size;
    setJobs((prev) => {
      const byId = new Map(prev.map((job) => [job.id, job]));
      for (const job of incoming) {
        const existing = byId.get(job.id);
        if (existing) {
          byId.set(job.id, { ...existing, ...job, jd: job.jd || existing.jd, badge: existing.badge });
        } else {
          byId.set(job.id, { ...job, source: "linkedin", badge: markFresh ? "Just in" : null });
        }
      }
      return [...byId.values()];
    });
    return addedCount;
  };

  /**
   * Two-stage search: saved roles from earlier searches load instantly, then
   * the live LinkedIn scrape (30–180s) streams in fresh listings and the
   * server saves them for the next search.
   */
  const handleSearchLinkedInJobs = async (overrideKeywords, overrideYears) => {
    const keywords = (overrideKeywords ?? linkedInSearchKeywords).trim() || "Product Manager";
    const levels = yearsToLinkedInLevels(overrideYears !== undefined ? overrideYears : yearsNum);
    const location = linkedInSearchIndiaOnly ? "India" : (linkedInSearchLocation.trim() || "India");
    const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
    const params = new URLSearchParams({ keywords, location });
    if (levels.length) params.set("experienceLevel", levels.join(","));

    // A search for a different role starts a fresh grid; re-running the same search refreshes it.
    // Results from a search that has since been superseded are dropped.
    const searchId = ++searchIdRef.current;
    const isCurrent = () => searchIdRef.current === searchId;
    if (lastSearchKeyRef.current !== `${keywords}|${location}`) {
      jobsRef.current = [];
      setJobs([]);
    }
    lastSearchKeyRef.current = `${keywords}|${location}`;

    setLinkedInSearchError(null);
    setLinkedInSearching(true);
    setJobFeedStatus({ keywords, savedCount: 0, freshCount: null });

    fetch(`${base}/api/jobs/saved?${params}`)
      .then((res) => (res.ok ? res.json() : { jobs: [] }))
      .then((data) => {
        if (!isCurrent()) return;
        const savedCount = mergeJobs(data.jobs || []);
        setJobFeedStatus((s) => (s && s.keywords === keywords ? { ...s, savedCount } : s));
      })
      .catch(() => {});

    try {
      params.set("limit", String(linkedInSearchLimit));
      const res = await fetch(`${base}/api/linkedin-jobs?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!res.ok) {
        setLinkedInSearchError(data.details || data.error || `Search failed (${res.status})`);
        return;
      }
      const freshCount = mergeJobs(data.jobs || [], { markFresh: true });
      setJobFeedStatus((s) => (s && s.keywords === keywords ? { ...s, freshCount } : s));
    } catch (e) {
      if (isCurrent()) setLinkedInSearchError(e.message || "Search failed");
    } finally {
      if (isCurrent()) setLinkedInSearching(false);
    }
  };

  const handleDeleteJob = (id) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
    if (selectedJob && selectedJob.id === id) {
      setSelectedJob(null);
      setStep("select");
    }
  };

  const handleExtractResume = async () => {
    const text = resumeText.trim();
    if (!text) return;
    setExtractingResume(true);
    try {
      const extracted = await extractResumeFromText(text);
      setResume(extracted);
      setResumeText("");
    } catch (e) {
      console.error("Error extracting resume:", e);
    } finally {
      setExtractingResume(false);
    }
  };

  const readFileToText = async (file) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        let fullText = "";
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += pageTextInReadingOrder(content.items, page.getViewport({ scale: 1 }).width) + "\n\n";
        }
        return fullText.trim();
      } catch (e) {
        const msg = e?.message || String(e);
        if (/load failed|worker|invalid/i.test(msg)) {
          throw new Error("Could not read this PDF. Try saving your resume as TXT or paste the text into the box below.");
        }
        throw e;
      }
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  };

  const handleUploadAndParse = async (file) => {
    if (!file) return;
    const name = file.name || "Resume";
    const size = file.size ? `${(file.size / 1024).toFixed(1)} KB` : "";
    setUploadedFileName(name);
    setUploadedFileSize(size);
    setParsingStatus({ ...DEFAULT_PARSING_STATUS });
    setParsingError(null);
    setStep("parsing");
    // A new resume means a new search: drop the previous resume's roles and ignore its in-flight search.
    searchIdRef.current++;
    lastSearchKeyRef.current = "";
    jobsRef.current = [];
    setJobs([]);
    setJobFeedStatus(null);
    setLinkedInSearching(false);
    setShowBelowLevelJobs(false);

    try {
      const text = await readFileToText(file);
      setParsingStatus((s) => ({ ...s, extractText: true }));

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const [extracted, photoUrl] = await Promise.all([
        extractResumeFromText(text),
        isPdf ? extractPdfPhoto(file) : Promise.resolve(null),
      ]);
      if (photoUrl) extracted.photoUrl = photoUrl;
      setResume(extracted);
      setResumeText(text);
      setParsingStatus((s) => ({ ...s, parseStructure: true }));

      // Move to the job grid now instead of blocking on the LinkedIn search —
      // that's a live Apify scrape (server/index.js) that can take 30–180s.
      // Fetch it in the background and stream results into the grid once ready.
      setStep("select");
      setParsingStatus((s) => ({ ...s, findJobs: true }));

      const roles = extracted.targetRoles && extracted.targetRoles.length
        ? extracted.targetRoles
        : [(extracted.title || "").trim() || "Product Manager"];
      setSuggestedRoles(roles);
      const years = getCandidateYears(extracted);
      setCandidateYears(years != null ? String(years) : "");
      const keywords = roles[0];
      setLinkedInSearchKeywords(keywords);
      handleSearchLinkedInJobs(keywords, years);
    } catch (err) {
      console.error("Upload/parse error:", err);
      const msg = err.message || "Something went wrong";
      const isNetwork = /fetch failed|failed to fetch|network error|connection refused/i.test(msg);
      const isApiKey = /missing|not configured|api key|invalid.*key|anthropic|quota|401|429/i.test(msg);
      setParsingError(
        isNetwork
          ? "Could not reach the server. Start it with: npm run dev:all"
          : isApiKey
            ? (import.meta.env.DEV ? `Resume parsing failed: ${msg}` : "Resume parsing is temporarily unavailable. Please try again later.")
            : msg
      );
      setResume(null);
      setStep("upload");
    } finally {
      setParsingStatus((s) => ({ ...s, findJobs: true }));
    }
  };

  const handleResumeFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (step === "upload") {
      handleUploadAndParse(file);
      return;
    }
    setReadingPdf(true);
    try {
      const text = await readFileToText(file);
      setResumeText(text);
    } catch (err) {
      console.error("Read error:", err);
      setResumeText("");
    } finally {
      setReadingPdf(false);
    }
  };

  /** Score the resume against a job; runs in the background when a job is picked so the assistant can start right away. */
  const scoreAgainstJob = async (job) => {
    if (!job || !resume) return;
    setLoading(true);
    setLoadingMsg("Scoring your resume against this job…");
    try {
      const scoreData = await scoreResume(job, resume);
      setScore(scoreData.score);
      setScoreBreakdown(scoreData);
    } catch (e) {
      console.error("Scoring error:", e);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleReset = () => {
    setStep("upload");
    searchIdRef.current++;
    lastSearchKeyRef.current = "";
    setLinkedInSearching(false);
    setJobs([]);
    setSelectedJob(null);
    setResume(null);
    setScore(null);
    setScoreBreakdown(null);
    setSuggestions([]);
    setAssistantChat({ messages: [], decisions: [] });
    setApprovedIds(new Set());
    setUpdatedResume(null);
    setLinkedInText("");
    setSuggestedRoles([]);
    setCandidateYears("");
    setShowBelowLevelJobs(false);
    setJobFeedStatus(null);
    setUploadedFileName("");
    setUploadedFileSize("");
    setParsingStatus({ ...DEFAULT_PARSING_STATUS });
    setParsingError(null);
    setLoading(false);
    setLoadingMsg("");
    setApplyingChanges(false);
  };

  const handleApplyChanges = async () => {
    setApplyingChanges(true);
    try {
      const approved = suggestions.filter((s) => approvedIds.has(s.id));
      // With nothing approved, continue with the original resume.
      setUpdatedResume(approved.length ? applyApprovedChangesClientSide(resume, approved) : null);
      setStep("preview");
    } catch (e) {
      console.error("Apply changes failed:", e);
    } finally {
      setApplyingChanges(false);
    }
  };

  const getFinalResume = () => updatedResume || resume;
  const updateFinalResume = (mutate) => {
    const next = JSON.parse(JSON.stringify(getFinalResume()));
    mutate(next);
    setUpdatedResume(next);
  };

  const resumeEditHandlers = {
    updateName: (v) => updateFinalResume((r) => { r.name = v; }),
    updateTitle: (v) => updateFinalResume((r) => { r.title = v; }),
    updateContact: (v) => updateFinalResume((r) => { r.contact = v; }),
    updateSummary: (v) => updateFinalResume((r) => { r.summary = v; }),
    updateExpField: (expIdx, field, v) => updateFinalResume((r) => {
      if (r.experience?.[expIdx]) r.experience[expIdx][field] = v;
    }),
    addExperience: () => updateFinalResume((r) => {
      r.experience = r.experience || [];
      r.experience.push({ role: "", company: "", location: "", period: "", bullets: [""] });
    }),
    removeExperience: (expIdx) => updateFinalResume((r) => {
      r.experience?.splice(expIdx, 1);
    }),
    updateBullet: (expIdx, bulletIdx, v) => updateFinalResume((r) => {
      if (!r.experience?.[expIdx]) return;
      r.experience[expIdx].bullets = r.experience[expIdx].bullets || [];
      r.experience[expIdx].bullets[bulletIdx] = v;
    }),
    removeBullet: (expIdx, bulletIdx) => updateFinalResume((r) => {
      r.experience?.[expIdx]?.bullets?.splice(bulletIdx, 1);
    }),
    addBullet: (expIdx) => updateFinalResume((r) => {
      if (!r.experience?.[expIdx]) return;
      r.experience[expIdx].bullets = r.experience[expIdx].bullets || [];
      r.experience[expIdx].bullets.push("");
    }),
    updateEduField: (eduIdx, field, v) => updateFinalResume((r) => {
      if (r.education?.[eduIdx]) r.education[eduIdx][field] = v;
    }),
    addEducation: () => updateFinalResume((r) => {
      r.education = r.education || [];
      r.education.push({ degree: "", school: "", year: "" });
    }),
    removeEducation: (eduIdx) => updateFinalResume((r) => {
      r.education?.splice(eduIdx, 1);
    }),
    updateSkill: (idx, v) => updateFinalResume((r) => {
      if (Array.isArray(r.skills)) r.skills[idx] = v;
    }),
    addSkill: () => updateFinalResume((r) => {
      r.skills = r.skills || [];
      r.skills.push("");
    }),
    removeSkill: (idx) => updateFinalResume((r) => {
      r.skills?.splice(idx, 1);
    }),
  };

  const handleOpenInReactiveResume = async () => {
    setOpeningInBuilder(true);
    setOpenInBuilderError(null);
    try {
      const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
      const response = await fetch(`${base}/api/rxresume/open-in-builder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeData: getFinalResume() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.builderUrl) {
        throw new Error(data?.details || data?.error || `Failed to open in Reactive Resume (${response.status})`);
      }
      window.open(data.builderUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("Open in Reactive Resume failed:", e);
      setOpenInBuilderError(e.message || "Failed to open in Reactive Resume.");
    } finally {
      setOpeningInBuilder(false);
    }
  };

  const handleSelectTemplate = async (templateId) => {
    setSelectedTemplate(templateId);
    setRenderingTemplate(true);
    setTemplateRenderError(null);
    try {
      const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
      const response = await fetch(`${base}/api/rxresume/render-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeData: getFinalResume(), template: templateId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.details || data?.error || `Failed to render template (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (templatePdfUrlRef.current) URL.revokeObjectURL(templatePdfUrlRef.current);
      templatePdfUrlRef.current = url;
      setTemplatePdfUrl(url);
    } catch (e) {
      console.error("Template render failed:", e);
      setTemplateRenderError(e.message || "Failed to render template.");
    } finally {
      setRenderingTemplate(false);
    }
  };

  useEffect(() => {
    return () => {
      if (templatePdfUrlRef.current) URL.revokeObjectURL(templatePdfUrlRef.current);
    };
  }, []);

  const currentStepOrder = getStepOrder(step);

  const renderScoreCircle = () => {
    const value = typeof score === "number" ? score : 0;
    const radius = 52;
    const strokeWidth = 10;
    const center = 70;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, value));
    const offset = circumference - (clamped / 100) * circumference;
    const tier = getScoreTier(clamped);

    return (
      <svg width={140} height={140}>
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00e5a0" />
            <stop offset="100%" stopColor="#0ad0ff" />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={tier.color === "#00e5a0" ? "url(#scoreGradient)" : tier.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text
          x={center}
          y={center - 4}
          textAnchor="middle"
          fill="#f0f0e8"
          fontFamily="'Playfair Display', serif"
          fontWeight="700"
          fontSize="32"
        >
          {typeof score === "number" ? clamped : "–"}
        </text>
        <text
          x={center}
          y={center + 18}
          textAnchor="middle"
          fill="#aaa"
          fontFamily="'DM Mono', monospace"
          fontSize="11"
        >
          /100
        </text>
      </svg>
    );
  };

  const approvedCount = approvedIds.size;

  return (
    <div style={styles.appRoot}>
      <div style={styles.appInner}>
        <style>{`
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

@keyframes fadeUp {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}

body {
  background: #0a0a14;
  color: #f0f0e8;
  margin: 0;
  font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.rq-editable {
  cursor: text;
  border-radius: 3px;
  transition: background 0.12s ease;
}
.rq-editable:hover {
  background: rgba(0, 132, 209, 0.08);
}
.rq-editable:focus {
  background: rgba(0, 132, 209, 0.1);
  box-shadow: 0 0 0 2px rgba(0, 132, 209, 0.4);
  outline: none;
}
.rq-editable-row {
  position: relative;
}
.rq-remove-btn {
  opacity: 0;
  transition: opacity 0.12s ease;
  cursor: pointer;
  border: none;
  background: rgba(220, 60, 60, 0.12);
  color: #d33;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}
.rq-editable-row:hover .rq-remove-btn {
  opacity: 1;
}
.rq-add-btn {
  cursor: pointer;
  border: 1px dashed #a8c8e0;
  background: transparent;
  color: #4a7ba6;
  border-radius: 6px;
  font-size: 11px;
  padding: 3px 10px;
  margin-top: 4px;
}
.rq-add-btn:hover {
  background: rgba(0, 132, 209, 0.08);
}
        `}</style>

        <header style={styles.stickyHeader}>
          <div style={styles.headerRow}>
            <div style={styles.logo}>
              <span style={styles.logoMark}>◈</span>
              <span>RESUMEIQ</span>
            </div>
            <nav style={styles.stepNav}>
              {[
                { id: "upload", num: 1, label: "Upload" },
                { id: "parsing", num: 2, label: "Parsing" },
                { id: "select", num: 3, label: "Job Matches" },
                { id: "suggestions", num: 4, label: "Tailor" },
                { id: "preview", num: 5, label: "Preview" },
              ].map((s, idx) => {
                const order = getStepOrder(s.id);
                let state = "future";
                if (order === currentStepOrder) state = "active";
                else if (order < currentStepOrder) state = "past";
                const goToStep = () => {
                  setStep(s.id === "parsing" ? "select" : s.id);
                };
                return (
                  <button
                    type="button"
                    key={s.id}
                    style={styles.stepItem(state)}
                    onClick={goToStep}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = state === "active" ? "1" : state === "past" ? "0.7" : "0.4"; }}
                  >
                    <div style={styles.stepCircle(state === "active")}>
                      {s.num}
                    </div>
                    <span style={styles.stepLabel}>{s.label}</span>
                    {idx < 4 && <span style={styles.stepArrow}>→</span>}
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        <main style={styles.mainCard}>
          {step === "upload" && (
            <section style={styles.stepSection}>
              <div style={styles.uploadHero}>
                <div style={styles.uploadTitle}>AI-POWERED RESUME INTELLIGENCE</div>
                <h1 style={styles.uploadHeadline}>
                  Find Jobs That <span style={styles.uploadHeadlineAccent}>Actually Fit You</span>
                </h1>
                <p style={styles.uploadSubtext}>
                  Upload your resume. We’ll scan the job market, score every match, and help you tailor your resume to land interviews.
                </p>
              </div>
              {parsingError && (
                <div style={{ marginBottom: 16, padding: 12, background: "rgba(255,95,95,0.15)", borderRadius: 8, fontSize: 13, color: "#ff8a8a" }}>
                  {parsingError}
                </div>
              )}
              <div
                style={{
                  ...styles.dropZone,
                  ...(dropZoneHover ? styles.dropZoneHover : {}),
                }}
                onDragOver={(e) => { e.preventDefault(); setDropZoneHover(true); }}
                onDragLeave={() => setDropZoneHover(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropZoneHover(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file && /\.(pdf|txt|md)$/i.test(file.name)) handleUploadAndParse(file);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={styles.dropZoneIcon}>↑</div>
                <div style={styles.dropZoneLabel}>Drop your resume here</div>
                <div style={styles.dropZoneBrowse}>or browse files</div>
                <div style={styles.dropZoneTypes}>PDF, TXT, Markdown</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadAndParse(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <div style={styles.featureGrid}>
                <div style={styles.featureCard}>
                  <div style={styles.featureCardTitle}>AI Resume Parsing</div>
                  <div style={styles.featureCardDesc}>Extracts every detail automatically</div>
                </div>
                <div style={styles.featureCard}>
                  <div style={styles.featureCardTitle}>Live Job Search</div>
                  <div style={styles.featureCardDesc}>Real openings in India & worldwide</div>
                </div>
                <div style={styles.featureCard}>
                  <div style={styles.featureCardTitle}>Match Scoring</div>
                  <div style={styles.featureCardDesc}>% fit shown on every job card</div>
                </div>
                <div style={styles.featureCard}>
                  <div style={styles.featureCardTitle}>Smart Edits</div>
                  <div style={styles.featureCardDesc}>Approve AI suggestions one by one</div>
                </div>
              </div>
              <p style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "#666" }}>
                <button
                  type="button"
                  style={{ ...styles.ghostButton, fontSize: 12 }}
                  onClick={() => {
                    setResume(SAMPLE_RESUME);
                    setStep("select");
                  }}
                >
                  Use sample resume instead
                </button>
              </p>
            </section>
          )}

          {step === "parsing" && (
            <section style={styles.stepSection}>
              <div style={styles.parsingCard}>
                <div style={styles.parsingFileRow}>
                  <span style={styles.parsingFileIcon}>📄</span>
                  <div>
                    <div style={styles.parsingFileName}>{uploadedFileName}</div>
                    {uploadedFileSize && <div style={styles.parsingFileSize}>{uploadedFileSize}</div>}
                  </div>
                </div>
                <div style={styles.parsingStatusLine}>Structuring your profile with AI...</div>
                <ul style={styles.parsingList}>
                  <li style={styles.parsingListItem}>
                    <span style={parsingStatus.extractText ? styles.parsingBulletDone : styles.parsingBulletPending}>
                      {parsingStatus.extractText ? "✓" : "○"}
                    </span>
                    Extract text
                  </li>
                  <li style={styles.parsingListItem}>
                    <span style={parsingStatus.parseStructure ? styles.parsingBulletDone : styles.parsingBulletPending}>
                      {parsingStatus.parseStructure ? "✓" : "○"}
                    </span>
                    Parse structure
                  </li>
                  <li style={styles.parsingListItem}>
                    <span style={parsingStatus.findJobs ? styles.parsingBulletDone : styles.parsingBulletPending}>
                      {parsingStatus.findJobs ? "✓" : "○"}
                    </span>
                    Find matching jobs
                  </li>
                </ul>
              </div>
            </section>
          )}

          {step === "select" && (
            <section style={styles.stepSection}>
              <div style={{ ...styles.sectionHeader, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={styles.sectionTitle}>Your Job Matches</h2>
                  <p style={styles.sectionSubtitle}>
                    Jobs matched to your profile. Pick one to analyze fit and get tailored suggestions.
                  </p>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#888" }}>
                  Sort by
                  <select
                    value={jobSortBy}
                    onChange={(e) => setJobSortBy(e.target.value)}
                    style={{ ...styles.input, width: 160, padding: "8px 10px" }}
                  >
                    <option value="match">Best Match</option>
                    <option value="company">Company (A–Z)</option>
                    <option value="original">Original order</option>
                  </select>
                </label>
              </div>
              {parsingError && (
                <div style={{ marginBottom: 16, padding: 10, background: "rgba(245,200,66,0.1)", borderRadius: 8, fontSize: 12, color: "#f5c842" }}>
                  {parsingError}. You can add roles manually below.
                </div>
              )}
              {linkedInSearching && jobFeedStatus && (
                <div style={{ marginBottom: 16, padding: 10, background: "rgba(0,229,160,0.08)", borderRadius: 8, fontSize: 12, color: "#00e5a0", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={styles.monoStatus}>●</span>
                  {jobFeedStatus.savedCount > 0
                    ? `Showing ${jobFeedStatus.savedCount} recent role${jobFeedStatus.savedCount === 1 ? "" : "s"} for “${jobFeedStatus.keywords}”. Looking for fresh listings on LinkedIn — new ones will appear here as they arrive.`
                    : `Looking for fresh “${jobFeedStatus.keywords}” listings on LinkedIn — this can take a couple of minutes. New roles will appear here as they arrive.`}
                </div>
              )}
              {!linkedInSearching && jobFeedStatus && jobFeedStatus.freshCount != null && (
                <div style={{ marginBottom: 16, fontSize: 12, color: "#8b8ba7" }}>
                  {jobFeedStatus.freshCount > 0
                    ? `Up to date · ${jobFeedStatus.freshCount} new listing${jobFeedStatus.freshCount === 1 ? "" : "s"} from LinkedIn, marked “Just in”.`
                    : "Up to date · no new listings since the last search."}
                </div>
              )}

              <div style={styles.linkedInPanel}>
                <div style={styles.panelLabelRow}>
                  <div style={styles.panelLabel}>
                    <span>Search LinkedIn Jobs</span>
                  </div>
                  <div style={styles.smallPill}>India & worldwide · up to 150 jobs</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="Keywords (e.g. Senior Product Manager)"
                    value={linkedInSearchKeywords}
                    onChange={(e) => setLinkedInSearchKeywords(e.target.value)}
                    style={{ ...styles.input, flex: "1 1 200px", minWidth: 180 }}
                  />
                  <input
                    type="text"
                    placeholder="Location"
                    value={linkedInSearchIndiaOnly ? "India" : linkedInSearchLocation}
                    onChange={(e) => setLinkedInSearchLocation(e.target.value)}
                    disabled={linkedInSearchIndiaOnly}
                    style={{ ...styles.input, width: 140, opacity: linkedInSearchIndiaOnly ? 0.8 : 1 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#888", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={linkedInSearchIndiaOnly}
                      onChange={(e) => setLinkedInSearchIndiaOnly(e.target.checked)}
                      style={{ accentColor: "#00e5a0" }}
                    />
                    India only
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#888" }}>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      placeholder="–"
                      value={candidateYears}
                      onChange={(e) => setCandidateYears(e.target.value)}
                      style={{ ...styles.input, width: 56, padding: "8px 10px" }}
                    />
                    yrs exp
                  </label>
                  <select
                    value={linkedInSearchLimit}
                    onChange={(e) => setLinkedInSearchLimit(Number(e.target.value))}
                    style={{ ...styles.input, width: 72, padding: "8px 10px" }}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={150}>150</option>
                  </select>
                  <span style={{ fontSize: 12, color: "#666" }}>jobs</span>
                  <button
                    type="button"
                    style={{
                      ...styles.primaryButton,
                      ...(linkedInSearching ? styles.disabledButton : {}),
                    }}
                    disabled={linkedInSearching}
                    onClick={() => handleSearchLinkedInJobs()}
                  >
                    {linkedInSearching ? "Searching…" : "Search LinkedIn"}
                  </button>
                </div>
                {suggestedRoles.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "#666" }}>Based on your whole profile, try:</span>
                    {suggestedRoles.map((role) => {
                      const active = role === linkedInSearchKeywords;
                      return (
                        <button
                          key={role}
                          type="button"
                          style={{
                            ...styles.smallPill,
                            cursor: "pointer",
                            background: active ? "rgba(0,229,160,0.14)" : "transparent",
                            color: active ? "#00e5a0" : "#888",
                            borderColor: active ? "#00e5a0" : "#333",
                          }}
                          onClick={() => {
                            setLinkedInSearchKeywords(role);
                            handleSearchLinkedInJobs(role);
                          }}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                )}
                {linkedInSearchError && (
                  <div style={{ marginBottom: 8, fontSize: 12, color: "#ff5f5f" }}>{linkedInSearchError}</div>
                )}
              </div>

              <div style={styles.linkedInPanel}>
                <div style={styles.panelLabelRow}>
                  <div style={styles.panelLabel}>
                    <span>Paste JD / Job Posting</span>
                  </div>
                  <div style={styles.smallPill}>Drop the full JD text here</div>
                </div>
                <textarea
                  style={styles.textArea}
                  placeholder="Paste the full job description or LinkedIn posting here…"
                  value={linkedInText}
                  onChange={(e) => setLinkedInText(e.target.value)}
                />
                <div style={styles.smallHelpText}>
                  We’ll extract company, title, location, compensation hints, and
                  key details directly from this JD into a structured role card.
                </div>
                <div style={styles.linkedInActions}>
                  <button
                    style={{
                      ...styles.primaryButton,
                      ...(extracting || !linkedInText.trim()
                        ? styles.disabledButton
                        : {}),
                    }}
                    disabled={extracting || !linkedInText.trim()}
                    onClick={handleExtractJob}
                  >
                    ⚡ Extract Job
                  </button>
                  {extracting && (
                    <span style={styles.monoStatus}>
                      Extracting job details…
                    </span>
                  )}
                </div>
              </div>

              {belowLevelJobIds.size > 0 && (
                <div style={{ marginBottom: 12, fontSize: 12, color: "#8b8ba7", display: "flex", alignItems: "center", gap: 8 }}>
                  {showBelowLevelJobs
                    ? `Showing ${belowLevelJobIds.size} role${belowLevelJobIds.size === 1 ? "" : "s"} that ask for less experience than your ${yearsNum} years.`
                    : `Hid ${belowLevelJobIds.size} role${belowLevelJobIds.size === 1 ? "" : "s"} that ask for less experience than your ${yearsNum} years.`}
                  <button
                    type="button"
                    onClick={() => setShowBelowLevelJobs((v) => !v)}
                    style={{ background: "none", border: "none", color: "#00e5a0", cursor: "pointer", fontSize: 12, padding: 0 }}
                  >
                    {showBelowLevelJobs ? "Hide them" : "Show them"}
                  </button>
                </div>
              )}
              {sortedJobs.length === 0 && !linkedInSearching && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#8b8ba7", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 12, marginBottom: 16 }}>
                  No jobs yet. Search LinkedIn above to find roles that match your resume.
                </div>
              )}
              <div style={styles.jobGrid}>
                {sortedJobs.map((job) => {
                  const hovered = hoveredJobId === job.id;
                  const matchInfo = jobMatchScores.get(job.id);
                  return (
                    <div
                      key={job.id}
                      style={styles.jobCard(hovered)}
                      onMouseEnter={() => setHoveredJobId(job.id)}
                      onMouseLeave={() => setHoveredJobId(null)}
                      onClick={() => setExpandedJob(job)}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <div style={styles.jobCompany}>
                          {job.company.toUpperCase()}
                        </div>
                        <button
                          type="button"
                          style={{
                            ...styles.dangerButton,
                            padding: "4px 8px",
                            fontSize: 10,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteJob(job.id);
                          }}
                        >
                          ✕ Remove
                        </button>
                      </div>
                      <div style={styles.jobTitle}>{job.role}</div>
                      <div style={styles.jobMetaRow}>
                        <div style={styles.jobLocation}>{job.location}</div>
                        <div style={styles.jobSalary}>{job.salary}</div>
                      </div>
                      <div style={styles.jobMetaRow}>
                        {matchInfo && (
                          <div style={styles.matchPill(matchInfo.score)}>
                            {matchInfo.score}% Match
                          </div>
                        )}
                        {job.badge && (
                          <div style={styles.badgePill(job.badge)}>
                            {job.badge}
                          </div>
                        )}
                        {job.source === "linkedin" && (
                          <div style={styles.sourcePill}>LinkedIn</div>
                        )}
                      </div>
                      <div style={styles.jobPreview}>
                        {job.jd ? (job.jd.length > 280 ? `${job.jd.slice(0, 280)}…` : job.jd) : ""}
                      </div>
                      {job.url && (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 11, color: "#9bbcf6", marginTop: 6, display: "inline-block" }}
                        >
                          View full JD on LinkedIn →
                        </a>
                      )}
                      <div style={styles.cardFooterRow}>
                        <button
                          type="button"
                          style={styles.analyzeCta(hovered)}
                        >
                          View Details →
                        </button>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#666",
                          }}
                        >
                          Click anywhere to open
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {expandedJob && (
            <div
              style={styles.jobModalOverlay}
              onClick={() => setExpandedJob(null)}
            >
              <div style={styles.jobModalCard} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  style={styles.jobModalClose}
                  onClick={() => setExpandedJob(null)}
                >
                  ✕
                </button>
                <div style={styles.jobCompany}>{expandedJob.company.toUpperCase()}</div>
                <div style={{ ...styles.jobTitle, fontSize: 24, marginBottom: 10 }}>
                  {expandedJob.role}
                </div>
                <div style={{ ...styles.jobMetaRow, justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  {jobMatchScores.get(expandedJob.id) && (
                    <div style={styles.matchPill(jobMatchScores.get(expandedJob.id).score)}>
                      {jobMatchScores.get(expandedJob.id).score}% Match
                    </div>
                  )}
                  <div style={styles.badgePill(expandedJob.badge)}>{expandedJob.badge}</div>
                  {expandedJob.source === "linkedin" && (
                    <div style={styles.sourcePill}>LinkedIn</div>
                  )}
                </div>
                {expandedJob.url && (
                  <a
                    href={expandedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#9bbcf6", display: "inline-block", marginTop: 4 }}
                  >
                    View full posting on LinkedIn →
                  </a>
                )}
                <div style={styles.jobModalDivider} />

                {jobSummaryLoading && (
                  <div style={{ ...styles.monoStatus, marginBottom: 16 }}>
                    Summarizing role details…
                  </div>
                )}

                <div style={styles.jobSummaryGrid}>
                  <div style={styles.jobSummaryItem}>
                    <div style={styles.jobSummaryLabel}>Designation</div>
                    <div style={styles.jobSummaryValue}>{expandedJob.role || "Not specified"}</div>
                  </div>
                  <div style={styles.jobSummaryItem}>
                    <div style={styles.jobSummaryLabel}>Years of Experience</div>
                    <div style={styles.jobSummaryValue}>
                      {jobSummary ? jobSummary.yearsOfExperience : "…"}
                    </div>
                  </div>
                  <div style={styles.jobSummaryItem}>
                    <div style={styles.jobSummaryLabel}>Domain</div>
                    <div style={styles.jobSummaryValue}>{jobSummary ? jobSummary.domain : "…"}</div>
                  </div>
                  <div style={styles.jobSummaryItem}>
                    <div style={styles.jobSummaryLabel}>Salary</div>
                    <div style={styles.jobSummaryValue}>{expandedJob.salary || "Not mentioned"}</div>
                  </div>
                  <div style={styles.jobSummaryItem}>
                    <div style={styles.jobSummaryLabel}>Location</div>
                    <div style={styles.jobSummaryValue}>{expandedJob.location || "Not specified"}</div>
                  </div>
                  <div style={{ ...styles.jobSummaryItem, gridColumn: "1 / -1" }}>
                    <div style={styles.jobSummaryLabel}>Skill Sets</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {jobSummary && jobSummary.skills.length ? (
                        jobSummary.skills.map((s) => (
                          <span key={s} style={styles.skillChip}>{s}</span>
                        ))
                      ) : (
                        <span style={styles.jobSummaryValue}>{jobSummary ? "Not specified" : "…"}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  style={{ ...styles.ghostButton, marginTop: 20 }}
                  onClick={() => setShowFullJd((v) => !v)}
                >
                  {showFullJd ? "Hide full description" : "Show full description"}
                </button>
                {showFullJd && (
                  <div style={{ ...styles.jobModalJd, marginTop: 12 }}>
                    {expandedJob.jd || "No job description available."}
                  </div>
                )}

                <div style={styles.jobModalActions}>
                  <button
                    type="button"
                    style={styles.dangerButton}
                    onClick={() => {
                      handleDeleteJob(expandedJob.id);
                      setExpandedJob(null);
                    }}
                  >
                    ✕ Remove role
                  </button>
                  <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => {
                      handleJobAnalyzeClick(expandedJob);
                      setExpandedJob(null);
                    }}
                  >
                    Analyze My Fit →
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "suggestions" && (
            <section style={styles.stepSection}>
              <div style={styles.backRow}>
                <button
                  type="button"
                  style={styles.smallBackButton}
                  onClick={() => setStep("select")}
                >
                  ← Back to Job Matches
                </button>
                <div style={styles.analyzeTitle}>
                  {selectedJob
                    ? `${selectedJob.role} @ ${selectedJob.company}`
                    : "Tailor"}
                </div>
              </div>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Tailor your resume</h2>
                <p style={styles.sectionSubtitle}>
                  See how you fit this role, then work through the gaps with the
                  assistant. Accepted edits appear in your resume on the left.
                </p>
              </div>

              {loading && score == null && !scoreBreakdown && (
                <div style={{ ...styles.scoreCard, padding: 18 }}>
                  <span style={styles.monoStatus}>{loadingMsg || "Scoring your resume against this job…"}</span>
                </div>
              )}
              {scoreBreakdown && (
              <div style={styles.scoreCard}>
                <div style={styles.scoreLayout}>
                  <div style={styles.scoreCircleWrapper}>
                    {renderScoreCircle()}
                  </div>
                  <div style={styles.scoreMeta}>
                    {(() => {
                      const value = typeof score === "number" ? score : 0;
                      const tier = getScoreTier(value);
                      const breakdown = scoreBreakdown || {};
                      const bd = breakdown.breakdown || {};
                      const keyGaps =
                        (breakdown && breakdown.keyGaps) || [];
                      return (
                        <>
                          <div style={styles.scoreLabel(tier.color)}>
                            {breakdown.label || tier.label}
                          </div>
                          <div style={styles.scoreSummary}>
                            {breakdown.summary}
                          </div>
                          {!breakdown.unavailable && <div style={styles.breakdownGrid}>
                            {[
                              { key: "skills", label: "Skills" },
                              { key: "experience", label: "Experience" },
                              { key: "impact", label: "Impact" },
                              { key: "keywords", label: "Keywords" },
                            ].map((item) => {
                              const raw = bd[item.key] || 0;
                              const valuePct = Math.max(
                                0,
                                Math.min(100, (raw / 25) * 100)
                              );
                              const color =
                                item.key === "impact"
                                  ? "#f5c842"
                                  : "#00e5a0";
                              return (
                                <div key={item.key}>
                                  <div style={styles.breakdownItemLabel}>
                                    {item.label}
                                  </div>
                                  <div style={styles.breakdownBarOuter}>
                                    <div
                                      style={styles.breakdownBarInner(
                                        color,
                                        valuePct
                                      )}
                                    />
                                  </div>
                                  <div style={styles.breakdownScore}>
                                    {raw}/25
                                  </div>
                                </div>
                              );
                            })}
                          </div>}
                          {keyGaps && keyGaps.length > 0 && (
                            <>
                              <div style={styles.keyGapsTitle}>Key Gaps</div>
                              <ul style={styles.keyGapsList}>
                                {keyGaps.slice(0, 3).map((gap, idx) => (
                                  <li key={idx}>⚠ {gap}</li>
                                ))}
                              </ul>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              )}

              {selectedJob && resume && (() => {
                const acceptedEdits = suggestions.filter((s) => approvedIds.has(s.id));
                const workingResume = applyApprovedChangesClientSide(resume, acceptedEdits);
                return (
                  <div style={{ ...styles.twoColumn, marginTop: 16 }}>
                    <div style={styles.colLeft}>
                      <ResumeDocument
                        resume={workingResume}
                        highlights={acceptedEdits.map((e) => e.proposed).filter(Boolean)}
                        afterMode
                      />
                    </div>
                    <aside style={{ width: 460, maxWidth: "100%", flexShrink: 0, position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <TailoringAssistant
                  key={selectedJob.id}
                  job={selectedJob}
                  resume={workingResume}
                  chat={assistantChat}
                  setChat={setAssistantChat}
                  onAccept={(edit) => {
                    setSuggestions((prev) => [...prev, { ...edit, title: edit.jdRequirement }]);
                    setApprovedIds((prev) => new Set(prev).add(edit.id));
                  }}
                />
                      <details style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)" }}>
                        <summary style={{ cursor: "pointer", fontSize: 12, color: "#8b8ba7" }}>Job description</summary>
                        <div style={{ ...styles.jdScrollBox, marginTop: 10 }}>{selectedJob.jd || "No job description available."}</div>
                      </details>
                    </aside>
                  </div>
                );
              })()}

              <div style={styles.suggestionsFooterRow}>
                <div>
                  {approvedCount
                    ? `${approvedCount} edit${approvedCount === 1 ? "" : "s"} applied`
                    : "No edits applied yet – you can continue with your original resume"}
                </div>
                <button
                  type="button"
                  onClick={handleApplyChanges}
                  disabled={applyingChanges}
                  style={{
                    ...styles.primaryButton,
                    ...(applyingChanges ? styles.disabledButton : {}),
                  }}
                >
                  {approvedCount ? `Continue with ${approvedCount} edit${approvedCount === 1 ? "" : "s"} →` : "Continue with original resume →"}
                </button>
              </div>
            </section>
          )}

          {step === "preview" && (
            <section style={styles.stepSection}>
              <div style={styles.backRow}>
                <button
                  type="button"
                  style={styles.smallBackButton}
                  onClick={() => setStep("suggestions")}
                >
                  ← Back to Suggestions
                </button>
                <div style={styles.analyzeTitle}>Updated Resume</div>
              </div>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Updated Resume</h2>
                <p style={styles.sectionSubtitle}>
                  {approvedIds.size
                    ? `${approvedIds.size} approved change${
                        approvedIds.size > 1 ? "s" : ""
                      } applied. Click any text below to edit it directly.`
                    : "Click any text below to edit it directly."}
                </p>
              </div>

              <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <ResumeDocument
                  resume={getFinalResume()}
                  editable
                  onEdit={resumeEditHandlers}
                />
              </div>

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 15 }}>Preview in a designed template</div>
                <p style={{ margin: "0 0 12px", color: "#555", fontSize: 13 }}>
                  Rendered live by Reactive Resume's template engine — pick one to preview as a PDF, right here.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {RX_TEMPLATE_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t.id)}
                      disabled={renderingTemplate}
                      title={t.tags ? t.tags.join(" · ") : undefined}
                      style={{
                        ...styles.ghostButton,
                        fontSize: 12,
                        ...(selectedTemplate === t.id
                          ? { background: "#0084d1", color: "#fff", borderColor: "#0084d1" }
                          : {}),
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {renderingTemplate && (
                  <p style={{ fontSize: 13, color: "#555" }}>Rendering {selectedTemplate}…</p>
                )}
                {templateRenderError && (
                  <p style={{ color: "#d33", fontSize: 13 }}>{templateRenderError}</p>
                )}
                {templatePdfUrl && !renderingTemplate && (
                  <iframe
                    src={templatePdfUrl}
                    title="Template preview"
                    style={{ width: "100%", height: 800, border: "1px solid #ddd", borderRadius: 8 }}
                  />
                )}

                <p style={{ marginTop: 12, fontSize: 12 }}>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleOpenInReactiveResume(); }}
                    style={{ color: "#4a7ba6" }}
                  >
                    {openingInBuilder ? "Opening…" : "Prefer full drag-and-drop editing? Open in Reactive Resume →"}
                  </a>
                </p>
                {openInBuilderError && (
                  <p style={{ color: "#d33", fontSize: 13 }}>{openInBuilderError}</p>
                )}
              </div>

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>
                  PDF formatting
                </div>
                <p style={{ margin: "0 0 14px", color: "#555", fontSize: 13 }}>
                  Adjust layout and font sizes below. The preview shows how the downloaded PDF will look.
                </p>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
                    <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Layout &amp; fonts
                    </div>
                    {[
                      { key: "marginMm", label: "Margin (mm)", min: 8, max: 25, step: 1 },
                      { key: "sectionGap", label: "Section gap (mm)", min: 2, max: 12, step: 0.5 },
                      { key: "lineH", label: "Line height (mm)", min: 2.5, max: 6, step: 0.2 },
                      { key: "lineHSmall", label: "Line height small (mm)", min: 2.5, max: 5, step: 0.2 },
                      { key: "fontSizeName", label: "Name font (pt)", min: 12, max: 22, step: 1 },
                      { key: "fontSizeTitle", label: "Title font (pt)", min: 8, max: 14, step: 0.5 },
                      { key: "fontSizeContact", label: "Contact font (pt)", min: 7, max: 12, step: 0.5 },
                      { key: "fontSizeLabel", label: "Section label (pt)", min: 7, max: 12, step: 0.5 },
                      { key: "fontSizeBody", label: "Body font (pt)", min: 8, max: 12, step: 0.5 },
                      { key: "fontSizeBullet", label: "Bullet font (pt)", min: 7, max: 11, step: 0.5 },
                      { key: "photoWidthMm", label: "Photo width (mm)", min: 18, max: 40, step: 1 },
                      { key: "photoGapMm", label: "Photo gap (mm)", min: 4, max: 18, step: 1 },
                    ].map(({ key, label, min, max, step }) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ flex: "1 1 140px" }}>{label}</span>
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step={step}
                          value={pdfFormat[key]}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v)) setPdfFormat((f) => ({ ...f, [key]: v }));
                          }}
                          style={{ width: 64, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc" }}
                        />
                      </label>
                    ))}
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Font families
                    </div>
                    {[
                      { key: "fontHeader", label: "Headers / labels" },
                      { key: "fontBody", label: "Body text" },
                      { key: "fontBullet", label: "Bullets" },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                        <span style={{ flex: "1 1 120px" }}>{label}</span>
                        <select
                          value={pdfFormat[key] || "helvetica"}
                          onChange={(e) => setPdfFormat((f) => ({ ...f, [key]: e.target.value }))}
                          style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc", minWidth: 100 }}
                        >
                          {PDF_FONT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Page
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ flex: "1 1 120px" }}>Layout</span>
                      <select
                        value={pdfFormat.singlePage ? "single" : "multi"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, singlePage: e.target.value === "single" }))}
                        style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc", minWidth: 140 }}
                      >
                        <option value="multi">Multiple pages (page break)</option>
                        <option value="single">Single page (scale to fit)</option>
                      </select>
                    </label>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#666" }}>
                      Single page scales content to fit on one page.
                    </p>
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Colors
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <span style={{ flex: "1 1 100px" }}>Font color</span>
                      <input
                        type="color"
                        value={typeof pdfFormat.fontColor === "string" && pdfFormat.fontColor.startsWith("#") ? pdfFormat.fontColor : "#000000"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, fontColor: e.target.value }))}
                        style={{ width: 36, height: 28, padding: 0, border: "1px solid #ccc", borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={pdfFormat.fontColor || "#000000"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, fontColor: e.target.value }))}
                        placeholder="#000000"
                        style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 6 }}>
                      <span style={{ flex: "1 1 100px" }}>Background</span>
                      <input
                        type="color"
                        value={typeof pdfFormat.backgroundColor === "string" && pdfFormat.backgroundColor.startsWith("#") ? pdfFormat.backgroundColor : "#ffffff"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, backgroundColor: e.target.value }))}
                        style={{ width: 36, height: 28, padding: 0, border: "1px solid #ccc", borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={pdfFormat.backgroundColor || "#ffffff"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, backgroundColor: e.target.value }))}
                        placeholder="#ffffff"
                        style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                      />
                    </label>
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Divider
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={pdfFormat.showDivider !== false}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, showDivider: e.target.checked }))}
                      />
                      <span>Show horizontal divider</span>
                    </label>
                    {pdfFormat.showDivider !== false && (
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 6 }}>
                        <span style={{ flex: "1 1 100px" }}>Divider color</span>
                        <input
                          type="color"
                          value={typeof pdfFormat.dividerColor === "string" && pdfFormat.dividerColor.startsWith("#")
                            ? pdfFormat.dividerColor
                            : "#c8d0da"}
                          onChange={(e) => setPdfFormat((f) => ({ ...f, dividerColor: e.target.value }))}
                          style={{ width: 36, height: 28, padding: 0, border: "1px solid #ccc", borderRadius: 4 }}
                        />
                        <input
                          type="text"
                          value={pdfFormat.dividerColor || "#c8d0da"}
                          onChange={(e) => setPdfFormat((f) => ({ ...f, dividerColor: e.target.value }))}
                          placeholder="#c8d0da"
                          style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc", fontSize: 12 }}
                        />
                      </label>
                    )}
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Header layout
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={pdfFormat.skillsInHeader === true}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, skillsInHeader: e.target.checked }))}
                      />
                      <span>Put Skills in header (use space next to photo)</span>
                    </label>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#666" }}>
                      Shows Skills in the right column below contact, so the main body has more room.
                    </p>
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Section order
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: 12, color: "#555" }}>
                      Order of sections below the header (Skills in header uses the space next to photo instead).
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(pdfFormat.sectionOrder || DEFAULT_SECTION_ORDER).map((key, idx) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => {
                              const order = [...(pdfFormat.sectionOrder || DEFAULT_SECTION_ORDER)];
                              [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
                              setPdfFormat((f) => ({ ...f, sectionOrder: order }));
                            }}
                            style={{ padding: "2px 8px", fontSize: 11, opacity: idx === 0 ? 0.5 : 1 }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={idx === (pdfFormat.sectionOrder || DEFAULT_SECTION_ORDER).length - 1}
                            onClick={() => {
                              const order = [...(pdfFormat.sectionOrder || DEFAULT_SECTION_ORDER)];
                              [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
                              setPdfFormat((f) => ({ ...f, sectionOrder: order }));
                            }}
                            style={{ padding: "2px 8px", fontSize: 11, opacity: idx === (pdfFormat.sectionOrder || DEFAULT_SECTION_ORDER).length - 1 ? 0.5 : 1 }}
                          >
                            ↓
                          </button>
                          <span style={{ textTransform: "capitalize", fontSize: 13 }}>{key}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      style={{ ...styles.resetButton, marginTop: 6, alignSelf: "flex-start" }}
                      onClick={() => setPdfFormat({ ...DEFAULT_PDF_FORMAT, sectionOrder: [...DEFAULT_SECTION_ORDER] })}
                    >
                      Reset to default
                    </button>
                  </div>
                  <div style={{ flex: "1 1 400px", minWidth: 0, overflow: "auto", maxHeight: 720 }}>
                    <PdfStylePreview resume={updatedResume || resume} format={pdfFormat} />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18, alignItems: "center" }}>
                <button
                  type="button"
                  style={{
                    ...styles.primaryButton,
                    background: "rgba(0,229,160,0.15)",
                    border: "1px solid rgba(0,229,160,0.5)",
                  }}
                  onClick={async () => {
                    const data = updatedResume || resume;
                    const photoUrl = data?.photoUrl || null;
                    let photoDataUrl = photoUrl && photoUrl.startsWith("data:") ? photoUrl : null;
                    if (photoUrl && !photoDataUrl) try {
                      const r = await fetch(photoUrl);
                      const blob = await r.blob();
                      photoDataUrl = await new Promise((res) => {
                        const reader = new FileReader();
                        reader.onload = () => res(reader.result);
                        reader.readAsDataURL(blob);
                      });
                    } catch (e) {}
                    downloadResumePdf(data, photoDataUrl, pdfFormat);
                  }}
                >
                  ↓ Download PDF
                </button>
                <button type="button" style={styles.resetButton} onClick={handleReset}>
                  ← Analyze Another Job
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

