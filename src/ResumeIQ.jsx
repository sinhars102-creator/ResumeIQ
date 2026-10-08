import { useState, useEffect, useMemo, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";

// PDF.js worker: bundle via Vite so production gets a valid asset URL (fixes "load failed" on Vercel)
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { track, bucket } from "./analytics.js";
import EasyApplyPanel, { SignIn } from "./easyApply/EasyApplyPanel.jsx";
import { supabase as supabaseClient, loadProfile } from "./easyApply/supabaseClient.js";
import {
  MAX_BULLETS_PER_EXPERIENCE, PHOTO_WIDTH_MM, PHOTO_HEIGHT_MM, DEFAULT_SECTION_ORDER, DEFAULT_PDF_FORMAT, buildResumePdf,
} from "./resumePdf.js";
import UploadStep from "./UploadStep.jsx";
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;


// API origin: VITE_API_URL if set; otherwise the local dev server, or the same origin in
// production builds (the API is deployed alongside the frontend at /api on Vercel).
const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");

// The marketing landing page, served by this app at "/" (the product lives at /app).
const HOME_URL = "/";

// Where a role came from – shown as a pill on its card and in the "View posting" link.
const SOURCE_LABELS = {
  linkedin: "LinkedIn",
  greenhouse: "Career page",
  lever: "Career page",
  ashby: "Career page",
  workable: "Career page",
  adzuna: "Adzuna",
  naukri: "Naukri",
  glassdoor: "Glassdoor",
};
const sourceLabel = (source) => SOURCE_LABELS[source] || null;
const SOURCE_SITES = { linkedin: "LinkedIn", adzuna: "Adzuna", naukri: "Naukri", glassdoor: "Glassdoor" };
const postingLinkText = (source) => (SOURCE_SITES[source] ? `on ${SOURCE_SITES[source]}` : "on the company's career page");

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
    background: "var(--rq-bg)",
    color: "var(--rq-text)",
    padding: "24px 20px 40px",
    fontFamily:
      "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
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
      "color-mix(in srgb, var(--rq-bg) 92%, transparent)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid var(--rq-border)",
    marginBottom: 24,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },
  logo: {
    fontFamily: "inherit",
    fontSize: 16,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--rq-text)",
  },
  logoMark: {
    fontSize: 16,
    color: "var(--rq-accent)",
  },
  stepNav: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
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
    border: `1px solid ${isActive ? "var(--rq-accent)" : "var(--rq-border-strong)"}`,
    color: isActive ? "var(--rq-bg)" : "var(--rq-text)",
    background: isActive ? "var(--rq-accent)" : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
  }),
  stepLabel: {
  },
  stepArrow: {
    fontSize: 10,
    opacity: 0.6,
  },
  mainCard: {
    background:
      "var(--rq-surface)",
    borderRadius: 20,
    border: "1px solid var(--rq-border)",
    padding: 24,
    boxShadow: "0 1px 2px rgba(31, 42, 46, 0.04), 0 8px 24px rgba(31, 42, 46, 0.05)",
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
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-accent)",
    marginBottom: 8,
  },
  uploadHeadline: {
    fontFamily: "inherit",
    fontSize: 28,
    fontWeight: 700,
    color: "var(--rq-text)",
    marginBottom: 8,
    lineHeight: 1.3,
  },
  uploadHeadlineAccent: {
    color: "var(--rq-accent)",
  },
  uploadSubtext: {
    fontSize: 14,
    color: "var(--rq-text-2)",
    maxWidth: 480,
    margin: "0 auto",
    lineHeight: 1.5,
  },
  dropZone: {
    border: "2px dashed var(--rq-border)",
    borderRadius: 16,
    padding: "48px 24px",
    textAlign: "center",
    background: "color-mix(in srgb, var(--rq-border) 40%, transparent)",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
  },
  dropZoneHover: {
    borderColor: "color-mix(in srgb, var(--rq-accent) 50%, transparent)",
    background: "color-mix(in srgb, var(--rq-accent) 6%, transparent)",
  },
  dropZoneIcon: {
    fontSize: 36,
    marginBottom: 12,
    color: "var(--rq-text-3)",
  },
  dropZoneLabel: {
    fontSize: 15,
    color: "var(--rq-text)",
    marginBottom: 4,
  },
  dropZoneBrowse: {
    fontSize: 13,
    color: "var(--rq-accent)",
    cursor: "pointer",
  },
  dropZoneTypes: {
    fontSize: 11,
    color: "var(--rq-text-3)",
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
    background: "color-mix(in srgb, var(--rq-surface) 80%, transparent)",
    border: "1px solid var(--rq-border)",
    borderRadius: 12,
    padding: 16,
  },
  featureCardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--rq-text)",
    marginBottom: 4,
  },
  featureCardDesc: {
    fontSize: 11,
    color: "var(--rq-text-2)",
    lineHeight: 1.4,
  },
  parsingCard: {
    maxWidth: 420,
    margin: "0 auto",
    background: "color-mix(in srgb, var(--rq-surface) 90%, transparent)",
    border: "1px solid var(--rq-border)",
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
    color: "var(--rq-text-3)",
  },
  parsingFileName: {
    fontSize: 14,
    color: "var(--rq-text)",
    fontWeight: 500,
  },
  parsingFileSize: {
    fontSize: 12,
    color: "var(--rq-text-3)",
  },
  parsingStatusLine: {
    fontSize: 13,
    color: "var(--rq-text-2)",
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
    color: "var(--rq-text-2)",
    marginBottom: 10,
  },
  parsingBulletDone: {
    color: "var(--rq-accent)",
  },
  parsingBulletPending: {
    color: "var(--rq-warn)",
  },
  sectionHeader: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: "inherit",
    fontSize: 26,
    fontWeight: 600,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "var(--rq-text-2)",
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
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 8,
    padding: "9px 16px",
    border: "1px solid var(--rq-accent)",
    background: "var(--rq-accent)",
    color: "#FFFFFF",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  ghostButton: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 8,
    padding: "7px 12px",
    border: "1px solid var(--rq-border-strong)",
    background: "var(--rq-surface)",
    color: "var(--rq-text)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  dangerButton: {
    fontFamily: "inherit",
    fontSize: 12,
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid color-mix(in srgb, var(--rq-danger) 70%, transparent)",
    background: "color-mix(in srgb, var(--rq-danger) 6%, transparent)",
    color: "var(--rq-danger)",
    cursor: "pointer",
  },
  successButton: {
    fontFamily: "inherit",
    fontSize: 12,
    borderRadius: 999,
    padding: "6px 10px",
    border: "1px solid color-mix(in srgb, var(--rq-accent) 70%, transparent)",
    background: "color-mix(in srgb, var(--rq-accent) 6%, transparent)",
    color: "var(--rq-accent)",
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.4,
    cursor: "default",
  },
  linkedInPanel: {
    background:
      "var(--rq-surface)",
    borderRadius: 16,
    border: "1px solid var(--rq-border)",
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
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  smallPill: {
    fontSize: 10,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid var(--rq-border)",
    color: "var(--rq-text-2)",
  },
  textArea: {
    width: "100%",
    minHeight: 120,
    resize: "vertical",
    boxSizing: "border-box",
    background: "var(--rq-surface)",
    borderRadius: 10,
    border: "1px solid var(--rq-border)",
    padding: 12,
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    color: "var(--rq-text)",
    outline: "none",
  },
  input: {
    background: "var(--rq-surface)",
    borderRadius: 8,
    border: "1px solid var(--rq-border)",
    padding: "8px 12px",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 13,
    color: "var(--rq-text)",
    outline: "none",
  },
  smallHelpText: {
    marginTop: 6,
    fontSize: 11,
    color: "var(--rq-text-3)",
  },
  linkedInActions: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  monoStatus: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
  },
  jobFilterRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  filterChip: (active) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--rq-accent)" : "var(--rq-border-strong)"}`,
    background: active ? "var(--rq-accent)" : "var(--rq-surface)",
    color: active ? "#FFFFFF" : "var(--rq-text)",
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  }),
  easyApplyTag: {
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 6,
    background: "color-mix(in srgb, var(--rq-accent) 14%, transparent)",
    color: "var(--rq-accent)",
  },
  jobsLayout: {
    display: "grid",
    gridTemplateColumns: "190px minmax(0, 1fr)",
    gap: 28,
    alignItems: "start",
  },
  jobsNav: {
    position: "sticky",
    top: 96,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    paddingRight: 20,
    borderRight: "1px solid var(--rq-border)",
  },
  jobsNavItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    background: active ? "color-mix(in srgb, var(--rq-accent) 12%, transparent)" : "transparent",
    color: active ? "var(--rq-accent)" : "var(--rq-text-2)",
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    textAlign: "left",
    textDecoration: "none",
    cursor: active ? "default" : "pointer",
  }),
  pasteJdDetails: {
    marginBottom: 20,
    padding: "12px 16px",
    border: "1px solid var(--rq-border)",
    borderRadius: 12,
    background: "var(--rq-surface)",
  },
  pasteJdSummary: {
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--rq-text)",
    minHeight: 24,
  },
  jobList: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  jobRow: (hovered) => ({
    display: "flex",
    alignItems: "stretch",
    gap: 0,
    background: "var(--rq-surface)",
    border: `1px solid ${hovered ? "var(--rq-border-strong)" : "var(--rq-border)"}`,
    borderRadius: 16,
    overflow: "hidden",
    cursor: "pointer",
    boxShadow: hovered ? "0 8px 24px rgba(31, 42, 46, 0.08)" : "0 1px 2px rgba(31, 42, 46, 0.04)",
    transition: "box-shadow 0.15s ease, border-color 0.15s ease",
  }),
  jobRowBody: {
    flex: 1,
    minWidth: 0,
    padding: "20px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  companyMark: {
    flex: "none",
    width: 52,
    height: 52,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    fontWeight: 700,
    color: "var(--rq-accent)",
    background: "color-mix(in srgb, var(--rq-accent) 10%, var(--rq-surface))",
    border: "1px solid var(--rq-border)",
  },
  jobTagRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  jobTag: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 6,
    background: "color-mix(in srgb, var(--rq-border) 60%, transparent)",
    color: "var(--rq-text-2)",
  },
  jobRowTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.25,
    color: "var(--rq-text)",
  },
  jobRowCompany: {
    marginTop: 2,
    fontSize: 14,
    color: "var(--rq-text-2)",
  },
  jobRowMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px 24px",
    paddingTop: 12,
    borderTop: "1px solid var(--rq-border)",
  },
  jobRowMetaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--rq-text)",
  },
  jobRowPreview: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--rq-text-2)",
  },
  jobRowActions: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  jobRowLink: {
    fontSize: 12,
    color: "var(--rq-info)",
  },
  jobIconButton: {
    width: 40,
    height: 40,
    padding: 0, // the global button padding would squeeze the icon to nothing
    borderRadius: 999,
    border: "1px solid var(--rq-border)",
    background: "var(--rq-surface)",
    color: "var(--rq-text-2)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  jobScorePanel: {
    flex: "none",
    width: 210,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "20px 16px",
    textAlign: "center",
    background: "var(--rq-scrim)",
    color: "#FFFFFF",
  },
  jobScoreValue: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 28,
    fontWeight: 700,
  },
  jobScoreTier: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  jobScoreNote: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 1.4,
    color: "rgba(255,255,255,0.72)",
  },
  jobGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))",
    gap: 18,
    marginTop: 10,
  },
  jobCard: (hovered) => ({
    position: "relative",
    background:
      "var(--rq-surface)",
    borderRadius: 16,
    border: hovered ? "1px solid var(--rq-accent)" : "1px solid var(--rq-border)",
    padding: 16,
    cursor: "pointer",
    transform: hovered ? "translateY(-3px)" : "translateY(0)",
    transition:
      "transform 0.18s ease-out, border-color 0.18s ease-out, box-shadow 0.18s ease-out",
    boxShadow: hovered
      ? "0 6px 20px rgba(31, 42, 46, 0.08)"
      : "0 1px 2px rgba(31, 42, 46, 0.04)",
  }),
  jobCompany: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
    marginBottom: 4,
  },
  jobTitle: {
    fontFamily: "'Inter', system-ui, sans-serif",
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
    color: "var(--rq-text-2)",
  },
  jobSalary: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-accent)",
  },
  badgePill: (badge) => {
    let bg = "color-mix(in srgb, var(--rq-accent) 8%, transparent)";
    let color = "var(--rq-accent)";
    if (badge === "Hot") {
      bg = "color-mix(in srgb, var(--rq-danger) 12%, transparent)";
      color = "var(--rq-danger)";
    } else if (badge === "Urgent") {
      bg = "color-mix(in srgb, var(--rq-warn) 12%, transparent)";
      color = "var(--rq-warn)";
    } else if (badge === "New" || badge === "Remote" || badge === "Just in") {
      bg = "color-mix(in srgb, var(--rq-accent) 12%, transparent)";
      color = "var(--rq-accent)";
    }
    return {
      fontFamily: "inherit",
      fontSize: 10,
      padding: "4px 8px",
      borderRadius: 999,
      border: `1px solid ${color}`,
      background: bg,
      color,
    };
  },
  matchPill: (score) => {
    const tier = getScoreTier(score);
    return {
      fontFamily: "inherit",
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
    fontFamily: "inherit",
    fontSize: 12,
    padding: "3px 7px",
    borderRadius: 999,
    border: "1px solid color-mix(in srgb, var(--rq-info) 70%, transparent)",
    background: "color-mix(in srgb, var(--rq-info) 16%, transparent)",
    color: "var(--rq-info)",
  },
  jobPreview: {
    marginTop: 6,
    fontSize: 12,
    color: "var(--rq-text-2)",
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
    fontFamily: "inherit",
    fontSize: 12,
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid color-mix(in srgb, var(--rq-text) 50%, transparent)",
    background: "color-mix(in srgb, var(--rq-text) 6%, transparent)",
    color: "var(--rq-text)",
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(6px)",
    transition: "opacity 0.16s ease, transform 0.16s ease",
    cursor: visible ? "pointer" : "default",
  }),
  jobModalOverlay: {
    position: "fixed",
    inset: 0,
    background: "color-mix(in srgb, var(--rq-scrim) 82%, transparent)",
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
      "var(--rq-surface)",
    border: "1px solid var(--rq-border)",
    borderRadius: 20,
    padding: "32px 32px 28px",
    boxShadow: "0 16px 48px rgba(31, 42, 46, 0.14)",
  },
  jobModalClose: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: "1px solid var(--rq-border)",
    background: "color-mix(in srgb, var(--rq-text) 4%, transparent)",
    color: "var(--rq-text-2)",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
  },
  jobModalDivider: {
    height: 1,
    background: "var(--rq-border)",
    margin: "16px 0",
  },
  jobModalJd: {
    fontSize: 13.5,
    lineHeight: 1.7,
    color: "var(--rq-text-2)",
    whiteSpace: "pre-wrap",
  },
  jobSummaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 18,
  },
  jobSummaryItem: {},
  jobSummaryLabel: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
    marginBottom: 4,
  },
  jobSummaryValue: {
    fontSize: 14,
    color: "var(--rq-text)",
  },
  skillChip: {
    fontFamily: "inherit",
    fontSize: 12,
    padding: "5px 10px",
    borderRadius: 999,
    border: "1px solid var(--rq-border)",
    background: "color-mix(in srgb, var(--rq-text) 4%, transparent)",
    color: "var(--rq-text-2)",
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
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
  },
  analyzeTitle: {
    fontSize: 14,
    color: "var(--rq-text-2)",
  },
  smallBackButton: {
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 8,
    border: "1px solid var(--rq-border-strong)",
    background: "var(--rq-surface)",
    color: "var(--rq-text-2)",
    padding: "6px 12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  sideCard: {
    background: "var(--rq-surface)",
    borderRadius: 14,
    border: "1px solid var(--rq-border)",
    padding: 14,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    background:
      "var(--rq-accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 16,
    color: "var(--rq-bg)",
  },
  resumeName: {
    fontFamily: "inherit",
    fontSize: 17,
    fontWeight: 700,
  },
  resumeTitle: {
    fontSize: 12,
    color: "var(--rq-text-2)",
  },
  jdScrollBox: {
    marginTop: 6,
    maxHeight: 200,
    overflow: "auto",
    borderRadius: 10,
    border: "1px solid var(--rq-border)",
    background: "var(--rq-surface)",
    padding: 10,
    fontSize: 11,
    color: "var(--rq-text-3)",
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
    background: "var(--rq-surface)",
    borderRadius: 16,
    border: "1px solid var(--rq-border)",
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
    fontFamily: "inherit",
    fontSize: 24,
    fontWeight: 600,
    color,
    marginBottom: 4,
  }),
  scoreSummary: {
    fontSize: 13,
    color: "var(--rq-text-2)",
    marginBottom: 10,
  },
  breakdownGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0,1fr))",
    gap: 10,
    marginBottom: 8,
  },
  breakdownItemLabel: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
    marginBottom: 4,
  },
  breakdownBarOuter: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    background: "var(--rq-surface)",
    overflow: "hidden",
  },
  breakdownBarInner: (color, pct) => ({
    width: `${pct}%`,
    height: "100%",
    borderRadius: 999,
    background: color,
  }),
  breakdownScore: {
    marginTop: 3,
    fontSize: 11,
    color: "var(--rq-text-2)",
  },
  keyGapsTitle: {
    marginTop: 6,
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-warn)",
  },
  keyGapsList: {
    marginTop: 4,
    fontSize: 12,
    color: "var(--rq-warn)",
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
      background: "var(--rq-surface)",
      borderRadius: 14,
      border: "1px solid var(--rq-border)",
      padding: 14,
      transition:
        "border-color 0.16s ease, background-color 0.16s ease, opacity 0.16s ease",
    };
    if (state === "approved") {
      return {
        ...base,
        border: "1px solid color-mix(in srgb, var(--rq-accent) 35%, transparent)",
        background: "color-mix(in srgb, var(--rq-accent) 3%, transparent)",
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
    fontFamily: "inherit",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid var(--rq-border)",
    color: "var(--rq-text-2)",
  },
  typePill: {
    fontFamily: "inherit",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid color-mix(in srgb, var(--rq-accent) 50%, transparent)",
    color: "var(--rq-accent)",
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 6,
  },
  diffBlock: {
    background: "var(--rq-surface)",
    borderRadius: 10,
    border: "1px solid var(--rq-surface)",
    padding: 10,
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--rq-text-2)",
  },
  diffLabel: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
    marginBottom: 2,
  },
  diffBefore: {
    color: "var(--rq-danger)",
    textDecoration: "line-through",
  },
  diffAfter: {
    color: "var(--rq-accent)",
  },
  whyLine: {
    marginTop: 6,
    fontStyle: "italic",
    fontSize: 11,
    color: "var(--rq-text-3)",
  },
  suggestionsFooterRow: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
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
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-text-2)",
  },
  previewAfterLabel: {
    fontFamily: "inherit",
    fontSize: 12,
    color: "var(--rq-accent)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  resetButton: {
    marginTop: 18,
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 8,
    padding: "9px 16px",
    border: "1px solid var(--rq-accent)",
    background: "var(--rq-accent)",
    color: "var(--rq-surface)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
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

/** Roles Easy Apply can fill inside ResumeIQ (Greenhouse career pages, for now). */
const isEasyApplyJob = (job) => String(job?.id || "").startsWith("gh-");

/** "3 days ago" style age for a posting date, or "" when unknown. */
function timeAgo(date) {
  const ms = Date.now() - Date.parse(date || "");
  if (!Number.isFinite(ms) || ms < 0) return "";
  const units = [["year", 365 * 864e5], ["month", 30 * 864e5], ["week", 7 * 864e5], ["day", 864e5], ["hour", 36e5], ["minute", 6e4]];
  for (const [unit, size] of units) {
    const n = Math.floor(ms / size);
    if (n >= 1) return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  }
  return "Just now";
}

function getScoreTier(score) {
  if (score >= 75) {
    return { color: "var(--rq-accent)", label: "Strong Match" };
  }
  if (score >= 55) {
    return { color: "var(--rq-warn)", label: "Moderate Match" };
  }
  return { color: "var(--rq-danger)", label: "Needs Alignment" };
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
    (resume.certifications || []).join(" "),
    (resume.achievements || []).join(" "),
    ...(resume.experience || []).flatMap((e) => [e.role || "", ...(e.bullets || [])]),
  ];
  return parts.join(" \n ");
}

/**
 * AI scores are saved in the browser per (resume, years, job) so a job keeps the same score across
 * visits and reloads. Bump the version when the scoring prompt changes.
 */
const SCORE_CACHE_PREFIX = "rq-score-v3:";

function hashString(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function scoreCacheKey(resumeHash, years, job) {
  return `${SCORE_CACHE_PREFIX}${resumeHash}:${years || 0}:${job.id}:${hashString(job.jd || "")}`;
}

function readCachedScore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedScore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the score still shows, it just won't persist.
  }
}

/**
 * Experience points out of 25 from the candidate's years vs the JD's required range.
 * Computed in code so the card estimate and the AI analysis agree, and it never varies between runs.
 */
function experienceFit(candidateYears, jd) {
  const range = parseJdYearsRange(jd);
  if (!candidateYears || !range) return null;
  const { min, max } = range;
  let points;
  if (candidateYears >= min) points = max != null && candidateYears > max + 4 ? 20 : 25;
  else points = Math.round((25 * candidateYears) / min);
  const required = max != null ? `${min}–${max}` : `${min}+`;
  return { points, candidateYears, required, short: candidateYears < min };
}

/**
 * Client-side keyword/skills overlap score — no API calls, so it can run
 * instantly across an entire job grid (up to 150 results) without hitting
 * Claude rate limits or cost. The detailed Claude-scored breakdown still
 * runs on-demand in scoreResume() once a specific job is opened.
 */
/** Share of resume bullets that show a measurable result (numbers, %, currency, multipliers). */
function impactPoints(resume) {
  const bullets = (resume.experience || []).flatMap((e) => e.bullets || []).filter(Boolean);
  if (!bullets.length) return 0;
  const quantified = bullets.filter((b) => /\d|%|₹|\$|€|£/.test(b)).length;
  // Half of the bullets quantified earns full marks.
  return Math.round(25 * Math.min(1, quantified / bullets.length / 0.5));
}

/**
 * The four 0–25 parts behind every match score. Keywords, impact and experience are computed here
 * and shared by the quick estimate and the AI analysis; only "skills" differs between them.
 */
function scoreParts(resume, job, candidateYears = getCandidateYears(resume)) {
  if (!resume || !job) return null;
  const jdText = `${job.role || ""} ${job.jd || ""}`;
  const jdTokens = tokenizeForMatch(jdText);
  const resumeTokens = tokenizeForMatch(buildResumeCorpus(resume));
  if (!jdTokens.length || !resumeTokens.length) return null;

  // Terms the JD repeats are its real requirements; one-off words are mostly boilerplate.
  const resumeSet = new Set(resumeTokens);
  const jdFreq = new Map();
  jdTokens.forEach((t) => jdFreq.set(t, (jdFreq.get(t) || 0) + 1));
  const repeated = [...jdFreq.entries()].filter(([, count]) => count >= 2);
  const signalTerms = repeated.length >= 8 ? repeated : [...jdFreq.entries()];
  let matchedWeight = 0;
  let totalWeight = 0;
  signalTerms.forEach(([term, count]) => {
    const weight = Math.min(count, 4);
    totalWeight += weight;
    if (resumeSet.has(term)) matchedWeight += weight;
  });
  const keywordShare = totalWeight ? matchedWeight / totalWeight : 0;

  // Estimate of skills: how many of the role's skills the candidate lists – not the share of a long list.
  const skills = resume.skills || [];
  const jdLower = jdText.toLowerCase();
  const matchedSkills = skills.filter((s) => s && jdLower.includes(s.toLowerCase()));
  const skillShare = skills.length ? Math.min(1, matchedSkills.length / Math.min(skills.length, 8)) : keywordShare;

  const fit = experienceFit(candidateYears, jdText);
  return {
    skills: Math.round(25 * skillShare),
    experience: fit ? fit.points : 20,
    impact: impactPoints(resume),
    keywords: Math.round(25 * keywordShare),
    matchedSkills,
    fit,
  };
}

/**
 * Instant estimate for the job grid (no API calls): the same four parts as the AI analysis,
 * with skills estimated from the resume's skill list instead of the role's must-haves.
 */
function computeLocalMatchScore(resume, job, candidateYears = getCandidateYears(resume)) {
  const parts = scoreParts(resume, job, candidateYears);
  if (!parts) return null;
  const score = parts.skills + parts.experience + parts.impact + parts.keywords;
  return { score: Math.max(5, Math.min(98, score)), matchedSkills: parts.matchedSkills };
}

/**
 * Run a prompt through the API server (server/llm.js picks Groq or Claude),
 * so no model API key is shipped to the browser. Every caller expects JSON.
 */
async function callLLM(system, user, maxTokens) {
  const base = API_BASE.replace(/\/$/, "");
  const response = await fetch(`${base}/api/llm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user, maxTokens, json: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    track("ai_error", { step: "llm", status: response.status });
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
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/**
 * A role period ("Aug 2018 – Oct 2019", "Jan 2024 – Present", "03/2021 - 12/2021", "2019 – 2021") as an
 * inclusive range of month indexes (year * 12 + month), or null if it has no recognisable dates.
 * A year without a month starts in January / ends in December.
 */
function parsePeriod(period, now = new Date()) {
  const text = String(period || "").toLowerCase();
  const points = [];
  const re = /(?:(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s*,?\s*|(\d{1,2})\s*[/.-]\s*)?((?:19|20)\d{2})|\b(present|current|now|till date|to date|ongoing)\b/g;
  let m;
  while ((m = re.exec(text)) && points.length < 2) {
    if (m[4]) points.push({ index: now.getFullYear() * 12 + now.getMonth(), monthKnown: true });
    else {
      const month = m[1] ? MONTHS[m[1].slice(0, m[1] === "sept" ? 4 : 3)] : m[2] ? Number(m[2]) - 1 : null;
      points.push({ year: Number(m[3]), month: month != null && month >= 0 && month <= 11 ? month : null });
    }
  }
  if (!points.length) return null;
  const toIndex = (p, isEnd) => (p.index != null ? p.index : p.year * 12 + (p.month != null ? p.month : isEnd ? 11 : 0));
  const start = toIndex(points[0], false);
  const end = points[1] ? toIndex(points[1], true) : toIndex(points[0], true);
  return end >= start ? { start, end: Math.min(end, now.getFullYear() * 12 + now.getMonth()) } : null;
}

/**
 * Total experience from the roles' dates: months worked (overlapping roles counted once) / 12, plus
 * the gaps between roles. This is what the resume's history adds up to, whatever its summary claims.
 */
function experienceFromRoles(resume, now = new Date()) {
  const ranges = (resume?.experience || [])
    .map((e) => parsePeriod(e.period, now))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  if (!ranges.length) return null;
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  const months = merged.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
  const gaps = [];
  for (let i = 1; i < merged.length; i++) {
    const gapMonths = merged[i].start - merged[i - 1].end - 1;
    if (gapMonths > 3) gaps.push({ from: merged[i - 1].end + 1, to: merged[i].start - 1, months: gapMonths });
  }
  return { months, years: Math.round((months / 12) * 10) / 10, start: merged[0].start, gaps };
}

/** "Nov 2019" for a month index. */
function formatMonthIndex(index) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[index % 12]} ${Math.floor(index / 12)}`;
}

/** "6 years 6 months" */
function formatDuration(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} year${y === 1 ? "" : "s"}`, m && `${m} month${m === 1 ? "" : "s"}`].filter(Boolean).join(" ") || "0 months";
}

/** Years of experience: from the roles' dates when they can be read, else the figure the resume states. */
function getCandidateYears(resume) {
  if (!resume) return null;
  const fromRoles = experienceFromRoles(resume);
  if (fromRoles && fromRoles.months > 0) return fromRoles.years;
  const stated = Number(resume.yearsOfExperience);
  return Number.isFinite(stated) && stated > 0 ? Math.round(stated) : null;
}

/**
 * When the resume's own "N+ years" claim disagrees with its role dates by a year or more,
 * a correction to suggest: the exact phrase in the summary and what it should say.
 */
function experienceCorrection(resume) {
  const computed = experienceFromRoles(resume);
  const summary = resume?.summary || "";
  const match = summary.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  if (!computed || !match) return null;
  const stated = Number(match[1]);
  const whole = Math.floor(computed.years);
  if (!whole || Math.abs(whole - stated) < 1) return null;
  const phrase = match[0];
  return {
    stated,
    computed,
    original: phrase,
    proposed: phrase.replace(match[1], String(whole)).replace(/\s*\+?\s*(years|yrs)/i, (m, unit) => `+ ${unit}`),
  };
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
  "certifications": ["each certification exactly as written, e.g. Pega Certified Senior System Architect (CSSA)"] or [],
  "achievements": ["each achievement or award exactly as written"] or [],
  "interests": ["interest1", "interest2"] or [],
  "languages": ["Language1", "Language2"] or [],
  "references": [{"name": "Ref Name", "title": "Their Title"}] or []
}

Rules:
- Include EVERY role. If a role has dates and bullets but no company or title (e.g. a continuation on the next page), still include it with company/role as "" – never drop its bullets.
- Copy every bullet and the summary VERBATIM from the resume text (only remove bullet symbols and fix line breaks). Do not shorten, reword or merge them.
- The text may list a sidebar (contact, skills, education, certifications, achievements) separately from the main column; assign each item to its correct section.
- Certifications and achievements/awards are their own sections: list every one, verbatim, and never fold them into skills or the summary.

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
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.filter((c) => typeof c === "string" && c.trim()) : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.filter((a) => typeof a === "string" && a.trim()) : [],
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
  const computed = experienceFromRoles(resume);
  return computed ? { ...rest, totalExperience: `${computed.years} years (${computed.months} months across listed roles)` } : rest;
}

async function scoreResume(job, resumeData, candidateYears = getCandidateYears(resumeData)) {
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
    const parts = scoreParts(resumeData, job, candidateYears);
    const fit = parts?.fit;
    const user = `You are evaluating how well a candidate's resume matches a specific job description.
${fit ? `The candidate has ${fit.candidateYears} years of experience; the role asks for ${fit.required} years.\n` : ""}
List the role's must-have skills, tools and certifications (6–10, from the JD's requirements, not nice-to-haves),
and for each say whether the resume clearly shows it (stated skill, certification, or work described in a bullet).

Return ONLY a JSON object with this shape:
{
  "summary": "2–3 sentence overview of fit.",
  "mustHaveSkills": [{ "skill": "name", "candidateHas": true }],
  "keyGaps": ["gap 1", "gap 2", "gap 3"]
}

Job description:
${job.jd}

Resume JSON:
${JSON.stringify(resumeForAI(resumeData), null, 2)}`;
    const text = await callLLM(system, user, 1500);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    // Scores are computed here from the facts, so the same resume and job always give the same breakdown.
    const mustHaves = Array.isArray(parsed.mustHaveSkills) ? parsed.mustHaveSkills.filter((m) => m && m.skill) : [];
    if (parts) {
      parsed.breakdown = {
        skills: mustHaves.length ? Math.round((25 * mustHaves.filter((m) => m.candidateHas === true).length) / mustHaves.length) : parts.skills,
        experience: parts.experience,
        impact: parts.impact,
        keywords: parts.keywords,
      };
      parsed.score = parsed.breakdown.skills + parsed.breakdown.experience + parsed.breakdown.impact + parsed.breakdown.keywords;
      parsed.label = getScoreTier(parsed.score).label;
    }
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

const PDF_FONT_OPTIONS = [
  { value: "helvetica", label: "Helvetica" },
  { value: "times", label: "Times New Roman" },
  { value: "courier", label: "Courier" },
];

const MM_TO_PX = 2.5;

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

function downloadResumePdf(resumeData, photoDataUrl, format = DEFAULT_PDF_FORMAT) {
  const doc = buildResumePdf(resumeData, photoDataUrl, format);
  if (!doc) return;
  const safeName = (resumeData.name || "resume").replace(/[^a-z0-9-_]/gi, "_").slice(0, 40);
  doc.save(`${safeName}_resume.pdf`);
}

/** The resume as a PDF data URI (for Easy Apply's upload), with its photo when it has one. */
async function resumePdfDataUri(resumeData, format = DEFAULT_PDF_FORMAT) {
  const photoUrl = resumeData?.photoUrl || null;
  let photoDataUrl = photoUrl && photoUrl.startsWith("data:") ? photoUrl : null;
  if (photoUrl && !photoDataUrl) {
    try {
      const blob = await (await fetch(photoUrl)).blob();
      photoDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      photoDataUrl = null; // the PDF still goes, just without the photo
    }
  }
  return buildResumePdf(resumeData, photoDataUrl, format)?.output("datauristring") || null;
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
function TailoringAssistant({ job, resume, chat, setChat, onAccept, onContinue, continueLabel }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // After the chosen gaps are covered the chat collapses to a summary; "Reopen chat" expands it again.
  const [reopened, setReopened] = useState(false);
  const scrollRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, loading]);

  const sendTurn = async (nextChat) => {
    setLoading(true);
    setError(null);
    try {
      const base = API_BASE.replace(/\/$/, "");
      const response = await fetch(`${base}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: resumeForAI(resume),
          job: { role: job.role, company: job.company, jd: job.jd },
          messages: nextChat.messages.filter((m) => m.role !== "note").map((m) => ({ role: m.role, content: m.text })),
          decisions: nextChat.decisions,
          focusGaps: (nextChat.gaps || []).filter((g) => (nextChat.focusGapIds || []).includes(g.id)),
          // Questions already asked on the current gap; past the limit the assistant must draft instead.
          questionsOnGap: (nextChat.gapQuestions || {})[nextChat.currentGapId] || 0,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Assistant request failed (${response.status})`);
      const edits = (data.edits || []).map((e) => ({ ...e, originalProposed: e.proposed, id: `a${Date.now()}-${++assistantEditSeq}`, status: "pending" }));
      track("assistant_reply", {
        edits: edits.length,
        placeholders: edits.some((e) => /\[[^\]]+\]/.test(e.proposed || "")),
        done: !!data.done,
        question_number: edits.length ? null : ((nextChat.gapQuestions || {})[nextChat.currentGapId] || 0) + 1,
      });
      setChat((c) => ({
        ...c,
        messages: [...c.messages, { role: "assistant", text: data.message, edits, quickReplies: data.quickReplies || [], done: !!data.done }],
        coveredGapIds: [...new Set([...(c.coveredGapIds || []), ...(data.coveredGapIds || [])])],
        // With chosen gaps, ResumeIQ decides which gap is current (skip/accept advance it), not the model.
        currentGapId: c.focusGapIds?.length ? c.currentGapId : data.currentGapId || c.currentGapId,
        gapQuestions:
          c.focusGapIds?.length && c.currentGapId && !edits.length
            ? { ...(c.gapQuestions || {}), [c.currentGapId]: ((c.gapQuestions || {})[c.currentGapId] || 0) + 1 }
            : c.gapQuestions,
      }));
      if (data.done) setReopened(false);
    } catch (e) {
      setError(e.message || "The assistant is unavailable right now.");
      track("ai_error", { step: "assistant", busy: /limit|busy/i.test(e.message || "") });
    } finally {
      setLoading(false);
    }
  };

  const loadGaps = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = API_BASE.replace(/\/$/, "");
      const response = await fetch(`${base}/api/assistant/gaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: resumeForAI(resume), job: { role: job.role, company: job.company, jd: job.jd } }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.gaps?.length) throw new Error(data.error || "No gaps returned");
      // Wording gaps are pre-selected: those are the ones rewording can actually close.
      setChat((c) => ({ ...c, gaps: data.gaps, selectedGapIds: data.gaps.filter((g) => g.kind === "wording").map((g) => g.id) }));
      track("gaps_listed", { total: data.gaps.length, wording: data.gaps.filter((g) => g.kind === "wording").length, real: data.gaps.filter((g) => g.kind === "real").length });
      setLoading(false);
    } catch {
      // Fall back to the open-ended conversation.
      const nextChat = { ...chat, focusGapIds: [] };
      setChat(nextChat);
      sendTurn(nextChat);
    }
  };

  useEffect(() => {
    if (startedRef.current || chat.messages.length || chat.gaps) return;
    startedRef.current = true;
    loadGaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleGap = (id) =>
    setChat((c) => {
      const selected = new Set(c.selectedGapIds || []);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...c, selectedGapIds: (c.gaps || []).map((g) => g.id).filter((g) => selected.has(g)) };
    });

  const startWithGaps = () => {
    const ids = chat.selectedGapIds || [];
    if (!ids.length || loading) return;
    const titles = (chat.gaps || []).filter((g) => ids.includes(g.id)).map((g) => g.title);
    // A later round (after "Work on more gaps") needs a user turn so the assistant switches focus.
    const messages = chat.messages.length ? [...chat.messages, { role: "user", text: `Let's work on: ${titles.join("; ")}.` }] : chat.messages;
    const nextChat = { ...chat, messages, focusGapIds: ids, currentGapId: ids[0] };
    track("gaps_chosen", { chosen: ids.length, of: (chat.gaps || []).length, real: (chat.gaps || []).filter((g) => ids.includes(g.id) && g.kind === "real").length, round: chat.messages.length ? "more" : "first" });
    setChat(nextChat);
    setReopened(false);
    sendTurn(nextChat);
  };

  // Skipping is handled here, not left to the model: mark the current gap covered and move on (or finish).
  const skipCurrentGap = () => {
    if (loading) return;
    track("gap_skipped");
    const ids = chat.focusGapIds || [];
    const current = chat.currentGapId || ids.find((id) => !(chat.coveredGapIds || []).includes(id));
    const coveredGapIds = [...new Set([...(chat.coveredGapIds || []), ...(current ? [current] : [])])];
    const next = ids.find((id) => !coveredGapIds.includes(id));
    const currentTitle = (chat.gaps || []).find((g) => g.id === current)?.title;
    if (!next) {
      const applied = (chat.decisions || []).filter((d) => d.decision === "accepted").length;
      setChat({
        ...chat,
        coveredGapIds,
        currentGapId: null,
        messages: [
          ...chat.messages,
          { role: "user", text: currentTitle ? `Skip “${currentTitle}”.` : "Skip this gap.", isDecision: true },
          {
            role: "assistant",
            text: applied
              ? `That's all the gaps you chose. ${applied} edit${applied === 1 ? " is" : "s are"} applied to your resume.`
              : "That's all the gaps you chose. No edits were applied, so your resume is unchanged.",
            edits: [],
            quickReplies: [],
            done: true,
          },
        ],
      });
      setReopened(false);
      return;
    }
    const nextTitle = (chat.gaps || []).find((g) => g.id === next)?.title;
    const nextChat = {
      ...chat,
      coveredGapIds,
      currentGapId: next,
      messages: [...chat.messages, { role: "user", text: `Skip that gap. Let's work on: ${nextTitle}.` }],
    };
    setChat(nextChat);
    sendTurn(nextChat);
  };

  const pickMoreGaps = () =>
    setChat((c) => {
      const remaining = (c.gaps || []).filter((g) => !(c.coveredGapIds || []).includes(g.id)).map((g) => g.id);
      return { ...c, focusGapIds: null, selectedGapIds: remaining, previousFocusGapIds: c.focusGapIds };
    });

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
    track("edit_decided", { decision, section: edit.section, type: edit.type, edited: edit.proposed !== edit.originalProposed });
    const edits = message.edits.map((e) => (e.id === editId ? { ...e, status: decision } : e));
    const messages = chat.messages.map((m, i) => (i === messageIndex ? { ...m, edits } : m));
    const decisions = [...chat.decisions, { decision, section: edit.section, original: edit.original, proposed: edit.proposed }];
    let nextChat = { ...chat, messages, decisions };
    // Once every edit in this message is decided, move the conversation on.
    if (edits.every((e) => e.status !== "pending")) {
      const accepted = edits.filter((e) => e.status === "accepted").length;
      const summary = accepted === edits.length ? "I accepted the edit." : accepted ? "I accepted some of the edits and rejected the rest." : "I rejected that edit.";
      nextChat = { ...nextChat, messages: [...nextChat.messages, { role: "user", text: summary, isDecision: true }] };
      // With chosen gaps, an accepted edit resolves the current gap: go to the next one, or finish.
      if (accepted && nextChat.focusGapIds?.length && nextChat.currentGapId) {
        const coveredGapIds = [...new Set([...(nextChat.coveredGapIds || []), nextChat.currentGapId])];
        const next = nextChat.focusGapIds.find((id) => !coveredGapIds.includes(id));
        if (!next) {
          const applied = nextChat.decisions.filter((d) => d.decision === "accepted").length;
          setChat({
            ...nextChat,
            coveredGapIds,
            currentGapId: null,
            messages: [
              ...nextChat.messages,
              { role: "assistant", text: `That's all the gaps you chose. ${applied} edit${applied === 1 ? " is" : "s are"} applied to your resume.`, edits: [], quickReplies: [], done: true },
            ],
          });
          setReopened(false);
          return;
        }
        const nextTitle = (nextChat.gaps || []).find((g) => g.id === next)?.title;
        nextChat = {
          ...nextChat,
          coveredGapIds,
          currentGapId: next,
          messages: [...nextChat.messages, { role: "user", text: `Next gap: ${nextTitle}.` }],
        };
      }
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
  const picking = !!chat.gaps && !chat.focusGapIds;
  const finished = !picking && !reopened && !loading && last?.role === "assistant" && last.done && !awaitingDecision;
  const focusGaps = (chat.gaps || []).filter((g) => (chat.focusGapIds || []).includes(g.id));
  const covered = new Set(chat.coveredGapIds || []);
  const acceptedCount = (chat.decisions || []).filter((d) => d.decision === "accepted").length;
  const uncoveredGaps = (chat.gaps || []).filter((g) => !covered.has(g.id));
  const kindPill = (kind) => ({
    fontSize: 11, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
    ...(kind === "real"
      ? { color: "var(--rq-warn)", background: "color-mix(in srgb, var(--rq-warn) 10%, transparent)" }
      : { color: "var(--rq-accent)", background: "color-mix(in srgb, var(--rq-accent) 10%, transparent)" }),
  });

  if (picking || finished || (loading && !chat.messages.length && !chat.focusGapIds)) {
    return (
      <div style={{ border: "1px solid var(--rq-border)", borderRadius: 14, background: "var(--rq-surface)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rq-border)", fontSize: 12, color: "var(--rq-text-2)" }}>
          <span style={{ color: "var(--rq-accent)", fontWeight: 600 }}>Tailoring assistant</span>
          {picking ? " · Choose the gaps you want to work on" : finished ? " · Done" : " · Reviewing this role"}
        </div>
        {!picking && !finished && (
          <div style={{ padding: 20, fontSize: 13, color: "var(--rq-text-2)" }}>Finding the gaps between your resume and this role…</div>
        )}
        {picking && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "var(--rq-text-2)" }}>
              <b style={{ color: "var(--rq-accent)" }}>Wording</b> gaps can be fixed by rewording what you already have.{" "}
              <b style={{ color: "var(--rq-warn)" }}>Real</b> gaps need new facts from you.
            </div>
            {chat.gaps.map((g) => {
              const on = (chat.selectedGapIds || []).includes(g.id);
              const done = covered.has(g.id);
              return (
                <label key={g.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${on ? "color-mix(in srgb, var(--rq-accent) 45%, transparent)" : "var(--rq-border)"}`, background: on ? "color-mix(in srgb, var(--rq-accent) 5%, transparent)" : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => toggleGap(g.id)} style={{ marginTop: 3, accentColor: "var(--rq-accent)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--rq-text)" }}>{g.title}</span>
                      <span style={kindPill(g.kind)}>{g.kind === "real" ? "Real" : "Wording"}</span>
                      {done && <span style={{ fontSize: 11, color: "var(--rq-accent)" }}>✓ Covered</span>}
                    </div>
                    {g.detail && <div style={{ fontSize: 12.5, color: "var(--rq-text-2)", marginTop: 3, lineHeight: 1.5 }}>{g.detail}</div>}
                  </div>
                </label>
              );
            })}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 4 }}>
              {chat.previousFocusGapIds?.length > 0 && chat.messages.length > 0 && (
                <button type="button" style={styles.ghostButton} onClick={() => setChat((c) => ({ ...c, focusGapIds: c.previousFocusGapIds }))}>
                  ← Back to chat
                </button>
              )}
              {onContinue && (
                <button type="button" style={styles.ghostButton} onClick={onContinue}>Skip – continue</button>
              )}
              <button
                type="button"
                onClick={startWithGaps}
                disabled={!(chat.selectedGapIds || []).length || loading}
                style={{ ...styles.primaryButton, ...(!(chat.selectedGapIds || []).length || loading ? styles.disabledButton : {}) }}
              >
                Work on {(chat.selectedGapIds || []).length || ""} gap{(chat.selectedGapIds || []).length === 1 ? "" : "s"} →
              </button>
            </div>
          </div>
        )}
        {finished && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--rq-accent)" }}>
              ✓ {focusGaps.length ? `Your ${focusGaps.length} chosen gap${focusGaps.length === 1 ? " is" : "s are"} covered` : "Key gaps covered"}
              {acceptedCount ? ` · ${acceptedCount} edit${acceptedCount === 1 ? "" : "s"} applied` : ""}
            </div>
            {last?.text && <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--rq-text)", whiteSpace: "pre-wrap" }}>{last.text}</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" style={styles.ghostButton} onClick={() => setReopened(true)}>Reopen chat</button>
              {uncoveredGaps.length > 0 && (
                <button type="button" style={styles.ghostButton} onClick={pickMoreGaps}>Work on more gaps</button>
              )}
              {onContinue && (
                <button type="button" style={styles.primaryButton} onClick={() => { track("tailoring_finished", { accepted_edits: acceptedCount, gaps_covered: covered.size }); onContinue(); }}>{continueLabel || "Continue →"}</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid color-mix(in srgb, var(--rq-text) 8%, transparent)", borderRadius: 14, background: "color-mix(in srgb, var(--rq-text) 2%, transparent)", display: "flex", flexDirection: "column", height: "min(640px, calc(100vh - 120px))", minHeight: 420 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid color-mix(in srgb, var(--rq-text) 6%, transparent)", fontSize: 12, color: "var(--rq-text-2)" }}>
        <span style={{ color: "var(--rq-accent)", fontWeight: 600 }}>Tailoring assistant</span> · Every edit is checked: it keeps your specifics and adds nothing you haven't confirmed.
      </div>
      {focusGaps.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid color-mix(in srgb, var(--rq-text) 6%, transparent)" }}>
          <button type="button" onClick={pickMoreGaps} disabled={loading} style={{ ...styles.ghostButton, fontSize: 11.5, padding: "3px 9px" }}>
            ← Gap list
          </button>
          {focusGaps.map((g, i) => {
            const isDone = covered.has(g.id);
            const isCurrent = !isDone && chat.currentGapId === g.id;
            return (
              <span key={g.id} title={g.detail} style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 999, border: `1px solid ${isCurrent ? "var(--rq-accent)" : "var(--rq-border)"}`, color: isDone ? "var(--rq-accent)" : isCurrent ? "var(--rq-text)" : "var(--rq-text-2)", background: isDone ? "color-mix(in srgb, var(--rq-accent) 8%, transparent)" : "transparent", fontWeight: isCurrent ? 600 : 400 }}>
                {isDone ? "✓ " : `${i + 1}. `}{g.title}
              </span>
            );
          })}
        </div>
      )}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14, maskImage: "linear-gradient(to bottom, transparent 0, var(--rq-text) 32px)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0, var(--rq-text) 32px)" }}>
        {chat.messages.map((m, mi) =>
          m.role === "user" ? (
            m.isDecision ? (
              <div key={mi} style={{ alignSelf: "center", fontSize: 11, color: "var(--rq-text-3)", fontFamily: "inherit" }}>{m.text}</div>
            ) : (
              <div key={mi} style={{ alignSelf: "flex-end", maxWidth: "80%", background: "color-mix(in srgb, var(--rq-accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--rq-accent) 25%, transparent)", borderRadius: "12px 12px 2px 12px", padding: "8px 12px", fontSize: 13, color: "var(--rq-text)", whiteSpace: "pre-wrap" }}>
                {m.text}
              </div>
            )
          ) : (
            <div key={mi} style={{ alignSelf: "flex-start", maxWidth: "92%", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "color-mix(in srgb, var(--rq-text) 5%, transparent)", borderRadius: "12px 12px 12px 2px", padding: "10px 14px", fontSize: 13, lineHeight: 1.55, color: "var(--rq-text)", whiteSpace: "pre-wrap" }}>
                {m.text}
              </div>
              {(m.edits || []).map((e) => (
                <div key={e.id} style={{ border: `1px solid ${e.status === "accepted" ? "color-mix(in srgb, var(--rq-accent) 45%, transparent)" : e.status === "rejected" ? "color-mix(in srgb, var(--rq-danger) 30%, transparent)" : "color-mix(in srgb, var(--rq-text) 12%, transparent)"}`, borderRadius: 10, padding: 12, background: "rgba(31, 42, 46, 0.04)", opacity: e.status === "rejected" ? 0.55 : 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={styles.sectionPill}>{e.section}{e.section === "Experience" && resume.experience?.[e.experienceIndex] ? ` · ${resume.experience[e.experienceIndex].company}` : ""}</div>
                    <div style={styles.typePill}>{e.type}</div>
                    {e.status !== "pending" && (
                      <span style={{ fontSize: 11, color: e.status === "accepted" ? "var(--rq-accent)" : "var(--rq-danger)", fontFamily: "inherit" }}>
                        {e.status === "accepted" ? "✓ Applied" : "✕ Rejected"}
                      </span>
                    )}
                  </div>
                  {e.jdRequirement && (
                    <div style={{ fontSize: 11, color: "var(--rq-text-2)", marginBottom: 8 }}>
                      Targets: <span style={{ color: "var(--rq-text)" }}>{e.jdRequirement}</span>
                    </div>
                  )}
                  {e.original && (
                    <div style={{ fontSize: 12.5, color: "var(--rq-danger)", textDecoration: e.type === "Removal" ? "line-through" : "none", background: "color-mix(in srgb, var(--rq-danger) 6%, transparent)", borderRadius: 6, padding: "6px 8px", marginBottom: 6 }}>
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
                      <div style={{ fontSize: 12.5, color: "var(--rq-text)", background: "color-mix(in srgb, var(--rq-accent) 6%, transparent)", borderRadius: 6, padding: "6px 8px", whiteSpace: "pre-wrap" }}>
                        <DiffText original={e.original} text={e.proposed} />
                      </div>
                    )
                  )}
                  {e.why && <div style={{ ...styles.whyLine, marginTop: 8 }}>💡 {e.why}</div>}
                  {e.status === "pending" && (() => {
                    const placeholders = (e.proposed || "").match(/\[[^\]]+\]/g) || [];
                    return (
                      <>
                        {placeholders.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "var(--rq-warn)" }}>
                            ✎ Fill in {placeholders.join(", ")} in the text above, then accept.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                          <button type="button" style={styles.dangerButton} disabled={loading} onClick={() => decide(mi, e.id, "rejected")}>✕ Reject</button>
                          <button
                            type="button"
                            title={placeholders.length ? "Fill in the [bracketed] parts first" : undefined}
                            style={{ ...styles.successButton, ...(placeholders.length ? styles.disabledButton : {}) }}
                            disabled={loading || placeholders.length > 0}
                            onClick={() => decide(mi, e.id, "accepted")}
                          >
                            ✓ Accept
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          )
        )}
        {loading && <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--rq-text-2)", fontFamily: "inherit" }}>Assistant is thinking…</div>}
        {error && (
          <div style={{ alignSelf: "stretch", fontSize: 12, color: "var(--rq-danger)", background: "color-mix(in srgb, var(--rq-danger) 8%, transparent)", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span>{error}</span>
            <button type="button" style={styles.ghostButton} onClick={() => sendTurn(chat)}>Retry</button>
          </div>
        )}
      </div>
      {last?.role === "assistant" && !loading && !awaitingDecision && (() => {
        // Skip/next is a reliable control below; other suggestions from the model stay as quick replies.
        const hadEdits = (last.edits || []).length > 0;
        const replies = (last.quickReplies || []).filter((q) => !(focusGaps.length && (/\b(skip|next gap|move on)\b/i.test(q) || !hadEdits)));
        if (!replies.length && !focusGaps.length) return null;
        return (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 16px 10px" }}>
            {replies.map((q) => (
              <button key={q} type="button" onClick={() => sendUserText(q)} style={{ ...styles.ghostButton, fontSize: 12, padding: "5px 10px" }}>{q}</button>
            ))}
            {focusGaps.length > 0 && (
              <button type="button" onClick={skipCurrentGap} style={{ ...styles.ghostButton, fontSize: 12, padding: "5px 10px" }}>
                {focusGaps.filter((g) => !covered.has(g.id)).length > 1 ? "Skip this gap →" : "Skip this gap and finish"}
              </button>
            )}
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid color-mix(in srgb, var(--rq-text) 6%, transparent)" }}>
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

const addedWordStyle = { color: "var(--rq-accent)", background: "color-mix(in srgb, var(--rq-accent) 16%, transparent)", borderRadius: 3 };

function DiffText({ original, text }) {
  if (!original) return <span style={addedWordStyle}>{text}</span>;
  return diffAddedWords(original, text).map((t, k) => (t.added ? <span key={k} style={addedWordStyle}>{t.text}</span> : t.text));
}

// Editable textarea that shows words added relative to `original` in a different color.
// A highlighted copy of the text sits behind a transparent textarea with identical metrics.
function DiffTextarea({ original, value, onChange }) {
  const backdropRef = useRef(null);
  const metrics = { padding: 8, border: "1px solid transparent", fontSize: 12.5, lineHeight: 1.5, fontFamily: "inherit", whiteSpace: "pre-wrap", overflowWrap: "break-word", boxSizing: "border-box", width: "100%", margin: 0, };
  return (
    <div style={{ position: "relative", borderRadius: 6, background: "color-mix(in srgb, var(--rq-accent) 6%, transparent)" }}>
      <div ref={backdropRef} aria-hidden style={{ ...metrics, position: "absolute", inset: 0, overflow: "hidden", color: "var(--rq-text)", pointerEvents: "none" }}>
        <DiffText original={original} text={value} />
        {value.endsWith("\n") ? " " : null}
      </div>
      <textarea
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        onScroll={(ev) => { if (backdropRef.current) backdropRef.current.scrollTop = ev.target.scrollTop; }}
        rows={4}
        style={{ ...metrics, display: "block", position: "relative", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--rq-accent) 40%, transparent)", background: "transparent", color: "transparent", caretColor: "var(--rq-text)", resize: "vertical" }}
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
        {(resume.certifications || []).length > 0 && (
          <>
            <div style={styles.resumeSectionTitle}>Certifications</div>
            <ul style={styles.resumeBullets}>
              {resume.certifications.map((c, idx) => (
                <li key={idx} style={styles.resumeBullet}>{c}</li>
              ))}
            </ul>
          </>
        )}
        {(resume.achievements || []).length > 0 && (
          <>
            <div style={styles.resumeSectionTitle}>Achievements</div>
            <ul style={styles.resumeBullets}>
              {resume.achievements.map((a, idx) => (
                <li key={idx} style={styles.resumeBullet}>{a}</li>
              ))}
            </ul>
          </>
        )}
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
      {(resume.certifications || []).length > 0 && (
        <>
          <div style={styles.resumeSectionTitle}>Certifications</div>
          <ul style={styles.resumeBullets}>
            {resume.certifications.map((c, idx) => (
              <li key={idx} style={styles.resumeBullet}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {(resume.achievements || []).length > 0 && (
        <>
          <div style={styles.resumeSectionTitle}>Achievements</div>
          <ul style={styles.resumeBullets}>
            {resume.achievements.map((a, idx) => (
              <li key={idx} style={styles.resumeBullet}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const DEFAULT_PARSING_STATUS = { extractText: false, parseStructure: false, findJobs: false };

export default function ResumeIQ() {
  const [step, setStep] = useState("upload");
  // Job whose Easy Apply panel is open (Greenhouse roles only, for now).
  const [easyApplyJob, setEasyApplyJob] = useState(null);
  const [easyApplyOnly, setEasyApplyOnly] = useState(false);

  // "/app?signin=1" (from the Chrome extension's "Open ResumeIQ"): sign in, or confirm the
  // extension is connected when already signed in.
  const [signInPrompt, setSignInPrompt] = useState(null); // null | "signin" | "connected"
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signin") !== "1" || !supabaseClient) return undefined;
    params.delete("signin");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    supabaseClient.auth.getSession().then(({ data }) => setSignInPrompt(data.session ? "connected" : "signin"));
    const { data } = supabaseClient.auth.onAuthStateChange((_e, session) => {
      if (session) setSignInPrompt((p) => (p === "signin" ? "connected" : p));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // "/app?easyApply=gh-<board>-<id>" (from the Chrome extension) opens Easy Apply for that role.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("easyApply");
    if (!jobId || !/^gh-[A-Za-z0-9_-]+-\d+$/.test(jobId)) return;
    params.delete("easyApply");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    fetch(`${API_BASE.replace(/\/$/, "")}/api/easy-apply/form?jobId=${encodeURIComponent(jobId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((form) => {
        if (form) setEasyApplyJob({ id: jobId, role: form.job.title, company: form.job.company, location: form.job.location, url: form.applyUrl, source: "greenhouse" });
      })
      .catch(() => {});
  }, []);
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
  // Reactive Resume builder embedded in the Updated Resume step: { builderUrl, embeddable }.
  const [rxEditor, setRxEditor] = useState(null);
  // Preview shows the editor as a full-window workspace; "classic" swaps back to the old view.
  const [showClassicPreview, setShowClassicPreview] = useState(false);
  const [workspaceTop, setWorkspaceTop] = useState(0);

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

  const [searchClock, setSearchClock] = useState(0);
  useEffect(() => {
    if (!linkedInSearching) return;
    const id = setInterval(() => setSearchClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [linkedInSearching]);

  // A job's AI score (from Analyze My Fit) replaces its quick keyword estimate everywhere it's shown.
  const [analyzedScores, setAnalyzedScores] = useState(() => new Map());
  const [dismissedYearsCorrection, setDismissedYearsCorrection] = useState(false);
  const [showMoreRoles, setShowMoreRoles] = useState(false);
  // Years used by both the estimate and the AI score: the "yrs exp" box, else what the resume implies.
  const matchYears = Number(candidateYears) || getCandidateYears(resume || SAMPLE_RESUME);
  const resumeHash = useMemo(() => hashString(JSON.stringify(resumeForAI(resume || SAMPLE_RESUME))), [resume]);
  const jobMatchScores = useMemo(() => {
    const resumeForMatch = resume || SAMPLE_RESUME;
    const map = new Map();
    jobs.forEach((job) => {
      const analyzed = analyzedScores.get(job.id) || readCachedScore(scoreCacheKey(resumeHash, matchYears, job));
      const estimate = computeLocalMatchScore(resumeForMatch, job, matchYears);
      map.set(job.id, analyzed ? { ...estimate, score: analyzed.score, analyzed: true } : estimate && { ...estimate, analyzed: false });
    });
    return map;
  }, [jobs, resume, analyzedScores, resumeHash, matchYears]);

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
  const easyApplyCount = useMemo(() => sortedJobs.filter(isEasyApplyJob).length, [sortedJobs]);
  const visibleJobs = useMemo(() => (easyApplyOnly ? sortedJobs.filter(isEasyApplyJob) : sortedJobs), [sortedJobs, easyApplyOnly]);

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

  // (Declared after the resume state and handleJobAnalyzeClick, which these effects use.)
  // "/app?tailor=<job id>" (from the Chrome extension) opens tailoring for that role, with the
  // resume from the signed-in user's profile – or after they upload one, if there's none.
  const [pendingTailorJob, setPendingTailorJob] = useState(null);
  const [tailorNotice, setTailorNotice] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("tailor");
    if (!jobId) return;
    params.delete("tailor");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    (async () => {
      const r = await fetch(`${API_BASE.replace(/\/$/, "")}/api/jobs/by-id?id=${encodeURIComponent(jobId)}`).catch(() => null);
      const job = r?.ok ? (await r.json()).job : null;
      if (!job) {
        setTailorNotice("Couldn't load that job – try Add to ResumeIQ in the extension again.");
        return;
      }
      setJobs((prev) => (prev.some((j) => j.id === job.id) ? prev : [job, ...prev]));
      setPendingTailorJob(job);
      const session = supabaseClient ? (await supabaseClient.auth.getSession()).data.session : null;
      const profile = session ? await loadProfile(session.user.id).catch(() => null) : null;
      if (profile?.resume) setResume(profile.resume);
      else setTailorNotice(`Upload your resume to tailor it for ${job.role} at ${job.company}.`);
    })();
  }, []);
  useEffect(() => {
    if (!pendingTailorJob || !resume) return;
    const job = pendingTailorJob;
    setPendingTailorJob(null);
    setTailorNotice("");
    track("tailor_from_extension");
    handleJobAnalyzeClick(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the resume is available
  }, [pendingTailorJob, resume]);

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
      track("job_description_pasted");
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
    // The same role often appears on LinkedIn and on the company's own career page:
    // match on company + title + city and keep one card, with the longest description.
    const dupKey = (job) => {
      const norm = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return `${norm(job.company)}|${norm(job.role)}|${norm(String(job.location || "").split(",")[0])}`;
    };
    const shownIds = new Set(jobsRef.current.map((job) => job.id));
    const shownKeys = new Set(jobsRef.current.map(dupKey));
    const addedCount = new Set(
      incoming.filter((job) => !shownIds.has(job.id) && !shownKeys.has(dupKey(job))).map((job) => job.id),
    ).size;
    setJobs((prev) => {
      const byId = new Map(prev.map((job) => [job.id, job]));
      const idByKey = new Map(prev.map((job) => [dupKey(job), job.id]));
      for (const job of incoming) {
        const existingId = byId.has(job.id) ? job.id : idByKey.get(dupKey(job));
        const existing = existingId ? byId.get(existingId) : null;
        if (existing) {
          const longer = (job.jd || "").length > (existing.jd || "").length;
          byId.set(existingId, {
            ...existing,
            ...(existingId === job.id ? job : {}),
            jd: longer ? job.jd : existing.jd,
            url: existing.url || job.url,
            salary: existing.salary || job.salary,
            badge: existing.badge,
          });
        } else {
          byId.set(job.id, { ...job, source: job.source || "linkedin", badge: markFresh ? "Just in" : null });
          idByKey.set(dupKey(job), job.id);
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
    const base = API_BASE.replace(/\/$/, "");
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
    setJobFeedStatus({ keywords, savedCount: null, careerCount: null, linkedInFound: 0, linkedInTotal: null, freshCount: null, startedAt: Date.now() });
    const searchStarted = Date.now();
    track("job_search_started", { india_only: linkedInSearchIndiaOnly, limit: linkedInSearchLimit, has_years: levels.length > 0 });
    const updateFeed = (patch) => setJobFeedStatus((s) => (s && s.keywords === keywords ? { ...s, ...patch } : s));

    fetch(`${base}/api/jobs/saved?${params}`)
      .then((res) => (res.ok ? res.json() : { jobs: [] }))
      .then((data) => {
        if (!isCurrent()) return;
        updateFeed({ savedCount: mergeJobs(data.jobs || []) });
      })
      .catch(() => updateFeed({ savedCount: 0 }));

    // Company career pages (Greenhouse, Lever, Ashby, Workable) and Adzuna – official APIs, full JDs.
    const sourceParams = new URLSearchParams(params);
    sourceParams.set("limit", "150");
    fetch(`${base}/api/jobs/sources?${sourceParams}`)
      .then((res) => (res.ok ? res.json() : { jobs: [] }))
      .then((data) => {
        if (!isCurrent()) return;
        const found = data.jobs || [];
        const added = mergeJobs(found, { markFresh: true });
        updateFeed({ careerCount: found.length, careerAdded: added });
        track("job_sources_completed", { found: found.length, new_roles: added, adzuna: !!data.sources?.adzuna?.configured });
      })
      .catch(() => updateFeed({ careerCount: 0, careerAdded: 0 }));

    try {
      params.set("limit", String(linkedInSearchLimit));
      // Live search: start an Apify run and poll its real item count so the wait shows progress.
      let liveJobs = null;
      const started = await fetch(`${base}/api/linkedin-jobs/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, location, limit: linkedInSearchLimit, experienceLevel: levels.join(",") }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (started?.cached && Array.isArray(started.jobs)) {
        // Searched recently by someone: served from the jobs repository, no live run.
        liveJobs = started.jobs;
      } else if (started?.runId && started?.datasetId) {
        const run = new URLSearchParams({ runId: started.runId, datasetId: started.datasetId });
        let status = "RUNNING";
        while (isCurrent() && ["READY", "RUNNING"].includes(status)) {
          await new Promise((r) => setTimeout(r, 3000));
          const progress = await fetch(`${base}/api/linkedin-jobs/progress?${run}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (!progress) continue;
          status = progress.status;
          if (isCurrent()) updateFeed({ linkedInFound: progress.found || 0 });
        }
        if (!isCurrent()) return;
        if (status === "SUCCEEDED") {
          const results = new URLSearchParams({ datasetId: started.datasetId, keywords, location, experienceLevel: levels.join(",") });
          const data = await fetch(`${base}/api/linkedin-jobs/results?${results}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
          if (data?.jobs?.length) liveJobs = data.jobs;
        }
      }
      if (!isCurrent()) return;

      let jobsFound = liveJobs;
      if (!jobsFound) {
        // Fallback: the single run-and-wait call (also tries RapidAPI and the guest API).
        const res = await fetch(`${base}/api/linkedin-jobs?${params}`);
        const data = await res.json().catch(() => ({}));
        if (!isCurrent()) return;
        if (!res.ok) {
          setLinkedInSearchError(data.details || data.error || `Search failed (${res.status})`);
          track("job_search_failed", { status: res.status });
          return;
        }
        jobsFound = data.jobs || [];
      }
      const freshCount = mergeJobs(jobsFound, { markFresh: true });
      updateFeed({ freshCount, linkedInTotal: jobsFound.length, linkedInFound: jobsFound.length });
      track("job_search_completed", {
        linkedin_found: jobsFound.length,
        new_roles: freshCount,
        live_progress: !!liveJobs,
        seconds: Math.round((Date.now() - searchStarted) / 1000),
      });
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
    setAnalyzedScores(new Map());
    setDismissedYearsCorrection(false);
    setJobFeedStatus(null);
    setLinkedInSearching(false);
    setShowBelowLevelJobs(false);

    const uploadStarted = Date.now();
    const fileType = (file.name.split(".").pop() || "unknown").toLowerCase();
    track("resume_uploaded", { file_type: fileType, size_kb: Math.round((file.size || 0) / 1024) });
    try {
      const text = await readFileToText(file);
      setParsingStatus((s) => ({ ...s, extractText: true }));

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const [extracted, photoUrl] = await Promise.all([
        extractResumeFromText(text),
        isPdf ? extractPdfPhoto(file) : Promise.resolve(null),
      ]);
      if (photoUrl) extracted.photoUrl = photoUrl;
      const computedExperience = experienceFromRoles(extracted);
      track("resume_parsed", {
        file_type: fileType,
        parse_seconds: Math.round((Date.now() - uploadStarted) / 1000),
        roles: (extracted.experience || []).length,
        skills: (extracted.skills || []).length,
        certifications: (extracted.certifications || []).length,
        achievements: (extracted.achievements || []).length,
        has_photo: !!photoUrl,
        years_bucket: bucket(getCandidateYears(extracted), [2, 5, 8, 12, 20]),
        experience_mismatch: !!experienceCorrection(extracted),
        role_gaps: computedExperience?.gaps.length || 0,
      });
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
      track("resume_parse_failed", {
        file_type: fileType,
        reason: /fetch failed|network/i.test(msg) ? "network" : /limit|busy|429/i.test(msg) ? "ai_limit" : /pdf/i.test(msg) ? "pdf_read" : "other",
      });
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
      // Reuse this job's earlier analysis (this session or a saved one) so the score doesn't shift between visits.
      const cacheKey = scoreCacheKey(resumeHash, matchYears, job);
      const reused = !!(analyzedScores.get(job.id) || readCachedScore(cacheKey));
      const scoreData = analyzedScores.get(job.id) || readCachedScore(cacheKey) || (await scoreResume(job, resume, matchYears));
      setScore(scoreData.score);
      setScoreBreakdown(scoreData);
      if (scoreData.score != null) {
        setAnalyzedScores((prev) => new Map(prev).set(job.id, scoreData));
        writeCachedScore(cacheKey, scoreData);
      }
      track("fit_analyzed", {
        score: scoreData.score,
        label: scoreData.label,
        reused,
        estimate: computeLocalMatchScore(resume, job, matchYears)?.score ?? null,
        source: job.source || "pasted",
      });
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
    setAnalyzedScores(new Map());
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
    track("continue_to_preview", { accepted_edits: approvedIds.size });
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

  // Imports the current resume into Reactive Resume and shows its builder inline.
  // Each call creates a fresh copy, so it also serves as "send my latest edits".
  const handleOpenInReactiveResume = async () => {
    setOpeningInBuilder(true);
    setOpenInBuilderError(null);
    try {
      const base = API_BASE.replace(/\/$/, "");
      const response = await fetch(`${base}/api/rxresume/open-in-builder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // A very large embedded photo would exceed the API's request size limit; send the resume without it.
          resumeData: (getFinalResume()?.photoUrl?.length || 0) > 1_500_000 ? { ...getFinalResume(), photoUrl: null } : getFinalResume(),
          name: [getFinalResume()?.name, selectedJob && [selectedJob.role, selectedJob.company].filter(Boolean).join(" @ ")]
            .filter(Boolean)
            .join(" – "),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.builderUrl) {
        throw new Error(data?.details || data?.error || `Failed to open in Reactive Resume (${response.status})`);
      }
      // rxresu.me refuses to be framed; only a self-hosted instance can be embedded.
      setRxEditor({ builderUrl: data.builderUrl, embeddable: !!data.embeddable });
    } catch (e) {
      console.error("Open in Reactive Resume failed:", e);
      setOpenInBuilderError(e.message || "Failed to open in Reactive Resume.");
    } finally {
      setOpeningInBuilder(false);
    }
  };

  const editorRequestedRef = useRef(false);
  useEffect(() => {
    if (step !== "preview") {
      editorRequestedRef.current = false;
      return;
    }
    if (editorRequestedRef.current) return;
    editorRequestedRef.current = true;
    track("preview_opened");
    handleOpenInReactiveResume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const editorWorkspace =
    step === "preview" && !showClassicPreview && !openInBuilderError && (openingInBuilder || !!rxEditor?.embeddable);
  useEffect(() => {
    if (!editorWorkspace) return;
    const measure = () => setWorkspaceTop(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
    window.scrollTo(0, 0);
    measure();
    window.addEventListener("resize", measure);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", measure);
      document.body.style.overflow = previousOverflow;
    };
  }, [editorWorkspace]);

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
            <stop offset="0%" stopColor="var(--rq-accent)" />
            <stop offset="100%" stopColor="var(--rq-accent)" />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--rq-surface)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={tier.color === "var(--rq-accent)" ? "url(#scoreGradient)" : tier.color}
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
          fill="var(--rq-text)"
          fontFamily="inherit"
          fontWeight="700"
          fontSize="32"
        >
          {typeof score === "number" ? clamped : "–"}
        </text>
        <text
          x={center}
          y={center + 18}
          textAnchor="middle"
          fill="var(--rq-text-2)"
          fontFamily="inherit"
          fontSize="11"
        >
          /100
        </text>
      </svg>
    );
  };

  const approvedCount = approvedIds.size;

  return (
    <div className="rq-app-root" style={styles.appRoot}>
      <div style={styles.appInner}>
        <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');

/* Narrow windows: stack the resume and the tailoring assistant instead of squeezing the resume. */
@media (max-width: 1000px) {
  .rq-two-col > * { flex: 1 1 100% !important; width: 100% !important; position: static !important; }
}

/* Job Matches: the left nav becomes a row above the list on narrow screens; on phones the score panel sits under the card. */
@media (max-width: 900px) {
  .rq-jobs-layout { grid-template-columns: minmax(0, 1fr) !important; gap: 16px !important; }
  .rq-jobs-nav { position: static !important; flex-direction: row !important; overflow-x: auto; padding-right: 0 !important; border-right: none !important; border-bottom: 1px solid var(--rq-border); padding-bottom: 8px; }
  .rq-jobs-nav-item { white-space: nowrap; }
}
@media (max-width: 640px) {
  .rq-job-card { flex-direction: column; }
  .rq-job-score { width: auto !important; flex-direction: row !important; justify-content: flex-start !important; text-align: left !important; }
}
.rq-jobs-nav-item:not([aria-current]):hover { background: color-mix(in srgb, var(--rq-border) 50%, transparent) !important; color: var(--rq-text) !important; }
.rq-jobs-nav-item:focus-visible, .rq-job-card button:focus-visible, .rq-job-card a:focus-visible { outline: 2px solid var(--rq-accent); outline-offset: 2px; }
/* Phones: wrap the header, compact the stepper, stack two-column layouts. */
@media (max-width: 640px) {
  .rq-app-root { padding: 12px 12px 32px !important; }
  .rq-header-row { flex-wrap: wrap; row-gap: 10px !important; }
  .rq-step-nav { width: 100%; overflow-x: auto; justify-content: space-between; gap: 6px !important; scrollbar-width: none; }
  .rq-step:not(.rq-step-active) .rq-step-label { display: none; }
  .rq-step-arrow { display: none; }
  .rq-main-card { padding: 16px !important; border-radius: 14px !important; }
  .rq-score-layout { flex-direction: column; align-items: stretch !important; }
  .rq-score-layout > * { flex: 1 1 auto !important; width: 100% !important; min-width: 0 !important; }
  .rq-workspace-bar { flex-wrap: wrap; padding: 8px 12px !important; }
  .rq-two-col > * { flex: 1 1 100% !important; width: 100% !important; position: static !important; }
}

/* Sage & Paper palette. Playfair Display and DM Sans are only used on the resume page itself. */
:root {
  color-scheme: light;
  --rq-bg: #F7F6F2;
  --rq-surface: #FFFFFF;
  --rq-border: #E6E3DC;
  --rq-border-strong: #D3CFC5;
  --rq-text: #1F2A2E;
  --rq-text-2: #5F6B6E;
  --rq-text-3: #8A9396;
  --rq-accent: #3F7D6E;
  --rq-warn: #B7862F;
  --rq-danger: #B5534A;
  --rq-info: #3B6EA8;
  --rq-scrim: #1F2A2E;
}

@keyframes rqPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@keyframes fadeUp {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}

body {
  background: var(--rq-bg);
  color: var(--rq-text);
  margin: 0;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.rq-editable {
  cursor: text;
  border-radius: 3px;
  transition: background 0.12s ease;
}
.rq-editable:hover {
  background: color-mix(in srgb, var(--rq-info) 8%, transparent);
}
.rq-editable:focus {
  background: color-mix(in srgb, var(--rq-info) 10%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rq-info) 40%, transparent);
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
  background: color-mix(in srgb, var(--rq-danger) 12%, transparent);
  color: var(--rq-danger);
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
  border: 1px dashed var(--rq-border-strong);
  background: transparent;
  color: var(--rq-info);
  border-radius: 6px;
  font-size: 11px;
  padding: 3px 10px;
  margin-top: 4px;
}
.rq-add-btn:hover {
  background: color-mix(in srgb, var(--rq-info) 8%, transparent);
}
        `}</style>

        <header style={styles.stickyHeader}>
          <div className="rq-header-row" style={styles.headerRow}>
            <div style={styles.logo}>
              <span style={styles.logoMark}>◈</span>
              <span>ResumeIQ</span>
            </div>
            <nav className="rq-step-nav" style={styles.stepNav}>
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
                    className={state === "active" ? "rq-step rq-step-active" : "rq-step"}
                    style={styles.stepItem(state)}
                    onClick={goToStep}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = state === "active" ? "1" : state === "past" ? "0.7" : "0.4"; }}
                  >
                    <div style={styles.stepCircle(state === "active")}>
                      {s.num}
                    </div>
                    <span className="rq-step-label" style={styles.stepLabel}>{s.label}</span>
                    {idx < 4 && <span className="rq-step-arrow" style={styles.stepArrow}>→</span>}
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="rq-main-card" style={styles.mainCard}>
          {step === "upload" && tailorNotice && (
            <div role="status" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, fontSize: 14, background: "color-mix(in srgb, var(--rq-accent) 10%, transparent)", color: "var(--rq-text)" }}>
              {tailorNotice}
            </div>
          )}
          {step === "upload" && (
            <UploadStep
              homeHref={HOME_URL}
              error={parsingError}
              onFile={handleUploadAndParse}
              onSample={() => {
                track("sample_resume_used");
                setResume(SAMPLE_RESUME);
                setStep("select");
              }}
            />
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
              <div className="rq-jobs-layout" style={styles.jobsLayout}>
              <nav className="rq-jobs-nav" aria-label="ResumeIQ sections" style={styles.jobsNav}>
                {[
                  { id: "jobs", label: "Jobs", icon: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>, active: true },
                  { id: "resume", label: "Resume", icon: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h4" /></>, onClick: () => setStep("preview") },
                  { id: "upload", label: "Upload new resume", icon: <><path d="M12 16V4" /><path d="M6 10l6-6 6 6" /><path d="M4 20h16" /></>, onClick: handleReset },
                  { id: "home", label: "Home", icon: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>, href: HOME_URL },
                ].map((item) => {
                  const content = (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{item.icon}</svg>
                      <span>{item.label}</span>
                    </>
                  );
                  return item.href ? (
                    <a key={item.id} href={item.href} className="rq-jobs-nav-item" style={styles.jobsNavItem(false)}>{content}</a>
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      className="rq-jobs-nav-item"
                      aria-current={item.active ? "page" : undefined}
                      style={styles.jobsNavItem(item.active)}
                      onClick={item.onClick}
                    >
                      {content}
                    </button>
                  );
                })}
              </nav>
              <div style={{ minWidth: 0 }}>
              <div style={{ ...styles.sectionHeader, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={styles.sectionTitle}>Your Job Matches</h2>
                  <p style={styles.sectionSubtitle}>
                    Jobs matched to your profile. Pick one to analyze fit and get tailored suggestions.
                  </p>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--rq-text-2)" }}>
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
                <div style={{ marginBottom: 16, padding: 10, background: "color-mix(in srgb, var(--rq-warn) 10%, transparent)", borderRadius: 8, fontSize: 12, color: "var(--rq-warn)" }}>
                  {parsingError}. You can add roles manually below.
                </div>
              )}
              {jobFeedStatus && (linkedInSearching || jobFeedStatus.freshCount != null) && (() => {
                const f = jobFeedStatus;
                const elapsed = Math.max(0, Math.round(((searchClock || Date.now()) - f.startedAt) / 1000));
                const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
                const done = !linkedInSearching;
                const rows = [
                  {
                    label: "Saved roles from earlier searches",
                    state: f.savedCount == null ? "active" : "done",
                    detail: f.savedCount == null ? "Checking…" : f.savedCount > 0 ? `${f.savedCount} matched instantly` : "None yet for this role",
                  },
                  {
                    label: "Company career pages & job boards",
                    state: f.careerCount == null ? "active" : "done",
                    detail: f.careerCount == null
                      ? "Checking…"
                      : f.careerCount > 0
                        ? `${f.careerCount} found${f.careerAdded ? ` · ${f.careerAdded} new` : ""}`
                        : "None for this role yet",
                  },
                  {
                    label: "LinkedIn · live listings",
                    state: done ? "done" : "active",
                    detail: done
                      ? `${f.linkedInTotal ?? 0} found${f.freshCount ? ` · ${f.freshCount} new, marked “Just in”` : " · nothing new since your last search"}`
                      : f.linkedInFound > 0
                        ? `${f.linkedInFound} role${f.linkedInFound === 1 ? "" : "s"} found so far…`
                        : "Searching…",
                  },
                  {
                    label: "Matching against your profile",
                    state: done ? "done" : jobs.length ? "active" : "waiting",
                    detail: jobs.length
                      ? `${jobs.length - belowLevelJobIds.size} role${jobs.length - belowLevelJobIds.size === 1 ? "" : "s"} scored${belowLevelJobIds.size ? ` · ${belowLevelJobIds.size} below your level hidden` : ""}`
                      : "Waiting for roles",
                  },
                ];
                const dot = (state) => ({
                  width: 18, height: 18, borderRadius: 999, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11,
                  ...(state === "done"
                    ? { background: "var(--rq-accent)", color: "#FFFFFF" }
                    : state === "active"
                      ? { border: "2px solid var(--rq-accent)", animation: "rqPulse 1.2s ease-in-out infinite" }
                      : { border: "2px solid var(--rq-border-strong)" }),
                });
                return (
                  <div style={{ marginBottom: 16, padding: "14px 16px", border: "1px solid var(--rq-border)", borderRadius: 12, background: "var(--rq-surface)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {done ? `Search complete for “${f.keywords}”` : `Finding “${f.keywords}” roles for you`}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--rq-text-2)" }}>
                        {done ? `took ${clock}` : `${clock} elapsed · usually 1–3 min`}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rows.map((r) => (
                        <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                          <span style={dot(r.state)}>{r.state === "done" ? "✓" : ""}</span>
                          <span style={{ color: "var(--rq-text)", minWidth: 0 }}>{r.label}</span>
                          <span style={{ marginLeft: "auto", color: r.state === "done" ? "var(--rq-accent)" : "var(--rq-text-2)", textAlign: "right" }}>{r.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div style={styles.linkedInPanel}>
                <div style={styles.panelLabelRow}>
                  <div style={styles.panelLabel}>
                    <span>Search jobs</span>
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
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--rq-text-2)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={linkedInSearchIndiaOnly}
                      onChange={(e) => setLinkedInSearchIndiaOnly(e.target.checked)}
                      style={{ accentColor: "var(--rq-accent)" }}
                    />
                    India only
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--rq-text-2)" }}>
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
                  <span style={{ fontSize: 12, color: "var(--rq-text-3)" }}>jobs</span>
                  <button
                    type="button"
                    style={{
                      ...styles.primaryButton,
                      ...(linkedInSearching ? styles.disabledButton : {}),
                    }}
                    disabled={linkedInSearching}
                    onClick={() => handleSearchLinkedInJobs()}
                  >
                    {linkedInSearching ? "Searching…" : "Search jobs"}
                  </button>
                </div>
                {suggestedRoles.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: "var(--rq-text-3)" }}>Based on your whole profile, try:</span>
                    {suggestedRoles.map((role) => {
                      const active = role === linkedInSearchKeywords;
                      return (
                        <button
                          key={role}
                          type="button"
                          style={{
                            ...styles.smallPill,
                            cursor: "pointer",
                            background: active ? "color-mix(in srgb, var(--rq-accent) 14%, transparent)" : "transparent",
                            color: active ? "var(--rq-accent)" : "var(--rq-text-2)",
                            borderColor: active ? "var(--rq-accent)" : "var(--rq-border)",
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
                  <div style={{ marginBottom: 8, fontSize: 12, color: "var(--rq-danger)" }}>{linkedInSearchError}</div>
                )}
              </div>

              <details className="rq-paste-jd" style={styles.pasteJdDetails}>
                <summary style={styles.pasteJdSummary}>Found a role elsewhere? Paste its job description</summary>
                <div style={{ marginTop: 12 }}>
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
              </details>

              {sortedJobs.length > 0 && (
                <div style={styles.jobFilterRow}>
                  <button
                    type="button"
                    aria-pressed={easyApplyOnly}
                    className="rq-filter-chip"
                    style={styles.filterChip(easyApplyOnly)}
                    onClick={() => setEasyApplyOnly((v) => !v)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
                    Easy Apply only ({easyApplyCount})
                  </button>
                  {easyApplyOnly && easyApplyCount === 0 && (
                    <span style={{ fontSize: 13, color: "var(--rq-text-2)" }}>
                      No Easy Apply roles in these results yet – they come from company career pages on Greenhouse.
                    </span>
                  )}
                </div>
              )}
              {belowLevelJobIds.size > 0 && (
                <div style={{ marginBottom: 12, fontSize: 12, color: "var(--rq-text-2)", display: "flex", alignItems: "center", gap: 8 }}>
                  {showBelowLevelJobs
                    ? `Showing ${belowLevelJobIds.size} role${belowLevelJobIds.size === 1 ? "" : "s"} that ask for less experience than your ${yearsNum} years.`
                    : `Hid ${belowLevelJobIds.size} role${belowLevelJobIds.size === 1 ? "" : "s"} that ask for less experience than your ${yearsNum} years.`}
                  <button
                    type="button"
                    onClick={() => setShowBelowLevelJobs((v) => !v)}
                    style={{ background: "none", border: "none", color: "var(--rq-accent)", cursor: "pointer", fontSize: 12, padding: 0 }}
                  >
                    {showBelowLevelJobs ? "Hide them" : "Show them"}
                  </button>
                </div>
              )}
              {sortedJobs.length === 0 && !linkedInSearching && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--rq-text-2)", border: "1px dashed color-mix(in srgb, var(--rq-text) 12%, transparent)", borderRadius: 12, marginBottom: 16 }}>
                  No jobs yet. Search above to find roles that match your resume.
                </div>
              )}
              <div style={styles.jobList}>
                {visibleJobs.map((job) => {
                  const hovered = hoveredJobId === job.id;
                  const matchInfo = jobMatchScores.get(job.id);
                  const tier = matchInfo ? getScoreTier(matchInfo.score) : null;
                  const posted = timeAgo(job.postedAt);
                  return (
                    <article
                      key={job.id}
                      className="rq-job-card"
                      style={styles.jobRow(hovered)}
                      onMouseEnter={() => setHoveredJobId(job.id)}
                      onMouseLeave={() => setHoveredJobId(null)}
                      onClick={() => setExpandedJob(job)}
                    >
                      <div style={styles.jobRowBody}>
                        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                          <div style={styles.companyMark} aria-hidden="true">
                            {(job.company || "?").trim().charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={styles.jobTagRow}>
                              {posted && <span style={styles.jobTag}>{posted}</span>}
                              {isEasyApplyJob(job) && <span style={styles.easyApplyTag}>Easy Apply</span>}
                              {job.badge && <span style={styles.badgePill(job.badge)}>{job.badge}</span>}
                              {sourceLabel(job.source) && <span style={styles.sourcePill}>{sourceLabel(job.source)}</span>}
                            </div>
                            <h3 style={styles.jobRowTitle}>{job.role}</h3>
                            <div style={styles.jobRowCompany}>{job.company}</div>
                          </div>
                        </div>
                        <div style={styles.jobRowMeta}>
                          {job.location && (
                            <span style={styles.jobRowMetaItem}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                              {job.location}
                            </span>
                          )}
                          {job.salary && (
                            <span style={styles.jobRowMetaItem}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>
                              {job.salary}
                            </span>
                          )}
                        </div>
                        {job.jd && (
                          <p style={styles.jobRowPreview}>{job.jd.length > 220 ? `${job.jd.slice(0, 220)}…` : job.jd}</p>
                        )}
                        <div style={styles.jobRowActions}>
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={styles.jobRowLink}
                            >
                              View posting {postingLinkText(job.source)} →
                            </a>
                          )}
                          <span style={{ flex: 1 }} />
                          <button
                            type="button"
                            aria-label={`Remove ${job.role} at ${job.company}`}
                            title="Remove this role"
                            style={styles.jobIconButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteJob(job.id);
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>
                          </button>
                          <button
                            type="button"
                            style={styles.ghostButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedJob(job);
                            }}
                          >
                            View details
                          </button>
                          <button
                            type="button"
                            style={isEasyApplyJob(job) ? styles.ghostButton : styles.primaryButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJobAnalyzeClick(job);
                            }}
                          >
                            Analyze my fit →
                          </button>
                          {isEasyApplyJob(job) && (
                            <button
                              type="button"
                              style={styles.primaryButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                track("easy_apply_opened", { source: job.source });
                                setEasyApplyJob(job);
                              }}
                            >
                              Easy Apply
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="rq-job-score" style={styles.jobScorePanel}>
                        <div style={{ position: "relative", width: 96, height: 96 }}>
                          <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                            <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="6" />
                            {matchInfo && (
                              <circle
                                cx="48" cy="48" r="42" fill="none"
                                stroke={`color-mix(in srgb, ${tier.color} 70%, white)`}
                                strokeWidth="6" strokeLinecap="round"
                                strokeDasharray={`${(matchInfo.score / 100) * 263.9} 263.9`}
                                transform="rotate(-90 48 48)"
                              />
                            )}
                          </svg>
                          <div style={styles.jobScoreValue}>
                            {matchInfo ? <>{matchInfo.analyzed ? "" : "~"}{matchInfo.score}<span style={{ fontSize: 15 }}>%</span></> : "–"}
                          </div>
                        </div>
                        <div>
                          <div style={styles.jobScoreTier}>{tier ? tier.label : "Not scored yet"}</div>
                          <div style={styles.jobScoreNote}>
                            {!matchInfo ? "Open the role to analyze" : matchInfo.analyzed ? "From the full AI analysis" : "Quick estimate · analyze for the full score"}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              </div>
              </div>
            </section>
          )}

          {signInPrompt && (
            <div className="ea-overlay" onClick={() => setSignInPrompt(null)}>
              <section className="ea-panel ea-signin-dialog" role="dialog" aria-modal="true" aria-label="Sign in to ResumeIQ" onClick={(e) => e.stopPropagation()}>
                <header className="ea-header">
                  <h2>{signInPrompt === "connected" ? "You're signed in" : "Sign in to ResumeIQ"}</h2>
                  <button type="button" className="ea-close" onClick={() => setSignInPrompt(null)} aria-label="Close">✕</button>
                </header>
                <div className="ea-body">
                  {signInPrompt === "connected" ? (
                    <div className="ea-outcome ea-outcome-ok" role="status">
                      <h3>Connected</h3>
                      <p>The ResumeIQ Chrome extension can use your account now. You can go back to the job page.</p>
                      <button type="button" className="ea-btn ea-btn-primary" onClick={() => setSignInPrompt(null)}>Done</button>
                    </div>
                  ) : (
                    <SignIn />
                  )}
                </div>
              </section>
            </div>
          )}

          {easyApplyJob && (
            <EasyApplyPanel
              job={easyApplyJob}
              resume={updatedResume || resume}
              getResumePdf={updatedResume || resume ? () => resumePdfDataUri(updatedResume || resume, pdfFormat) : null}
              apiBase={API_BASE}
              onClose={() => setEasyApplyJob(null)}
              onTailorResume={() => {
                const job = easyApplyJob;
                setEasyApplyJob(null);
                handleJobAnalyzeClick(job);
              }}
            />
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
                <div style={styles.jobCompany}>{expandedJob.company}</div>
                <div style={{ ...styles.jobTitle, fontSize: 24, marginBottom: 10 }}>
                  {expandedJob.role}
                </div>
                <div style={{ ...styles.jobMetaRow, justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  {jobMatchScores.get(expandedJob.id) && (
                    <div
                      style={styles.matchPill(jobMatchScores.get(expandedJob.id).score)}
                      title={jobMatchScores.get(expandedJob.id).analyzed ? "Score from the full AI analysis" : "Quick keyword estimate – Analyze My Fit for the full score"}
                    >
                      {jobMatchScores.get(expandedJob.id).analyzed
                        ? `${jobMatchScores.get(expandedJob.id).score}% Match ✓`
                        : `~${jobMatchScores.get(expandedJob.id).score}% Match (estimate)`}
                    </div>
                  )}
                  {expandedJob.badge && <div style={styles.badgePill(expandedJob.badge)}>{expandedJob.badge}</div>}
                  {sourceLabel(expandedJob.source) && (
                    <div style={styles.sourcePill}>{sourceLabel(expandedJob.source)}</div>
                  )}
                </div>
                {expandedJob.url && (
                  <a
                    href={expandedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "var(--rq-info)", display: "inline-block", marginTop: 4 }}
                  >
                    View full posting {postingLinkText(expandedJob.source)} →
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
                <div className="rq-score-layout" style={styles.scoreLayout}>
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
                                  ? "var(--rq-warn)"
                                  : "var(--rq-accent)";
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
                  <div className="rq-two-col" style={{ ...styles.twoColumn, marginTop: 16 }}>
                    <div style={styles.colLeft}>
                      <ResumeDocument
                        resume={workingResume}
                        highlights={acceptedEdits.map((e) => e.proposed).filter(Boolean)}
                        afterMode
                      />
                    </div>
                    <aside style={{ width: 460, maxWidth: "100%", flexShrink: 0, position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {(() => {
                  // The resume's "N+ years" claim vs what its role dates add up to.
                  const correction = experienceCorrection(workingResume);
                  if (!correction || dismissedYearsCorrection) return null;
                  const { computed } = correction;
                  return (
                    <div style={{ border: "1px solid color-mix(in srgb, var(--rq-warn) 40%, transparent)", background: "color-mix(in srgb, var(--rq-warn) 6%, transparent)", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--rq-text)" }}>Experience check</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--rq-text)" }}>
                        Your resume says <b>“{correction.original}”</b>, but your roles add up to{" "}
                        <b>{formatDuration(computed.months)}</b> ({computed.months} months since {formatMonthIndex(computed.start)}, overlaps counted once).
                      </div>
                      {computed.gaps.length > 0 && (
                        <div style={{ fontSize: 12, color: "var(--rq-text-2)", lineHeight: 1.5 }}>
                          No role is listed for {computed.gaps.map((g) => `${formatMonthIndex(g.from)} – ${formatMonthIndex(g.to)} (${g.months} mo)`).join(" and ")}. If you were working then, add those roles and your total will go up.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button type="button" style={styles.ghostButton} onClick={() => { track("experience_check", { action: "dismissed", diff_years: Math.floor(computed.years) - correction.stated }); setDismissedYearsCorrection(true); }}>Dismiss</button>
                        <button
                          type="button"
                          style={styles.primaryButton}
                          onClick={() => {
                            const edit = { id: `years-${Date.now()}`, section: "Summary", type: "Rewrite", original: correction.original, proposed: correction.proposed, jdRequirement: "Total experience" };
                            setSuggestions((prev) => [...prev, { ...edit, title: "Experience correction" }]);
                            setApprovedIds((prev) => new Set(prev).add(edit.id));
                            track("experience_check", { action: "applied", diff_years: Math.floor(computed.years) - correction.stated });
                          }}
                        >
                          Update to “{correction.proposed}”
                        </button>
                      </div>
                    </div>
                  );
                })()}
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
                  onContinue={handleApplyChanges}
                  continueLabel={approvedCount ? `Continue with ${approvedCount} edit${approvedCount === 1 ? "" : "s"} →` : "Continue with original resume →"}
                />
                      <details style={{ border: "1px solid color-mix(in srgb, var(--rq-text) 8%, transparent)", borderRadius: 12, padding: "10px 14px", background: "color-mix(in srgb, var(--rq-text) 2%, transparent)" }}>
                        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--rq-text-2)" }}>Job description</summary>
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

          {step === "preview" && editorWorkspace && (
            <div style={{ position: "fixed", top: workspaceTop, left: 0, right: 0, bottom: 0, zIndex: 15, display: "flex", flexDirection: "column", background: "var(--rq-bg)" }}>
              <div className="rq-workspace-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 20px", borderBottom: "1px solid var(--rq-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                  <button type="button" style={styles.smallBackButton} onClick={() => setStep("suggestions")}>
                    ← Back to Suggestions
                  </button>
                  {approvedIds.size > 0 && (
                    <span style={{ fontSize: 12, color: "var(--rq-text-2)", whiteSpace: "nowrap" }}>
                      {approvedIds.size} approved change{approvedIds.size > 1 ? "s" : ""} applied
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {selectedJob?.url && (
                    <a
                      href={selectedJob.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => track("job_posting_opened", { from: "preview", accepted_edits: approvedIds.size })}
                      style={{ ...styles.primaryButton, textDecoration: "none" }}
                    >
                      View job posting ↗
                    </a>
                  )}
                  {/* Fallback for browsers that block the editor's sign-in inside a frame (e.g. Safari on iPhone). */}
                  {rxEditor?.builderUrl && (
                    <a href={rxEditor.builderUrl} target="_blank" rel="noopener noreferrer" style={{ ...styles.ghostButton, textDecoration: "none" }}>
                      Open in new tab ↗
                    </a>
                  )}
                  <button type="button" style={styles.ghostButton} onClick={handleOpenInReactiveResume} disabled={openingInBuilder}>
                    {openingInBuilder ? "Loading…" : "↻ Reload with latest edits"}
                  </button>
                  <button type="button" style={styles.ghostButton} onClick={() => setShowClassicPreview(true)}>
                    Classic editor
                  </button>
                  <button type="button" style={styles.ghostButton} onClick={handleReset}>
                    ← Analyze another job
                  </button>
                </div>
              </div>
              {(() => {
                // Other roles ranked by the quick estimate against the TAILORED resume (AI scores were for the original).
                const tailored = getFinalResume();
                const moreRoles = jobs
                  .filter((j) => j.id !== selectedJob?.id && !belowLevelJobIds.has(j.id))
                  .map((j) => ({ job: j, score: computeLocalMatchScore(tailored, j, matchYears)?.score ?? 0 }))
                  .filter((r) => r.score >= 60)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 10);
                if (!moreRoles.length) return null;
                return (
                  <div style={{ borderBottom: "1px solid var(--rq-border)", background: "var(--rq-bg)" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!showMoreRoles) track("more_roles_opened", { shown: moreRoles.length });
                        setShowMoreRoles((v) => !v);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 20px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--rq-text)", textAlign: "left" }}
                    >
                      <span style={{ color: "var(--rq-accent)", fontWeight: 600 }}>{moreRoles.length} more role{moreRoles.length === 1 ? "" : "s"}</span>
                      <span style={{ color: "var(--rq-text-2)" }}>your tailored resume is a good fit for</span>
                      <span style={{ marginLeft: "auto", color: "var(--rq-text-2)" }}>{showMoreRoles ? "Hide ▴" : "Show ▾"}</span>
                    </button>
                    {showMoreRoles && (
                      <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "0 20px 12px", scrollSnapType: "x mandatory" }}>
                        {moreRoles.map(({ job, score }) => (
                          <div key={job.id} style={{ flex: "0 0 260px", scrollSnapAlign: "start", border: "1px solid var(--rq-border)", borderRadius: 12, background: "var(--rq-surface)", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ fontSize: 12, color: "var(--rq-text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.company}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--rq-text)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{job.role}</div>
                            <div style={{ fontSize: 12, color: "var(--rq-text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.location}</div>
                            <span style={{ ...styles.matchPill(score), alignSelf: "flex-start", whiteSpace: "nowrap" }} title="Quick estimate for your tailored resume">~{score}% Match</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                              <span style={{ display: "flex", gap: 6, width: "100%", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                                {job.url && (
                                  <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={() => track("job_posting_opened", { from: "more_roles" })} style={{ ...styles.ghostButton, fontSize: 12, padding: "4px 8px", textDecoration: "none" }}>
                                    Posting ↗
                                  </a>
                                )}
                                <button
                                  type="button"
                                  style={{ ...styles.ghostButton, fontSize: 12, padding: "4px 8px" }}
                                  onClick={() => {
                                    track("more_roles_tailor_clicked", { score });
                                    setShowMoreRoles(false);
                                    handleJobAnalyzeClick(job);
                                  }}
                                >
                                  Tailor for this →
                                </button>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {rxEditor?.embeddable ? (
                <iframe
                  key={rxEditor.builderUrl}
                  src={rxEditor.builderUrl}
                  onLoad={() => track("editor_loaded")}
                  title="Resume editor"
                  style={{ flex: 1, width: "100%", border: "none", display: "block", background: "var(--rq-bg)" }}
                />
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--rq-text-2)", fontSize: 13 }}>
                  Loading the resume editor…
                </div>
              )}
            </div>
          )}

          {step === "preview" && !editorWorkspace && (
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
                    ? `${approvedIds.size} approved change${approvedIds.size > 1 ? "s" : ""} applied. `
                    : ""}
                  Pick a template, restyle and edit your resume, then export the PDF.
                </p>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {rxEditor && (
                      <a href={rxEditor.builderUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rq-info)", fontSize: 12 }}>
                        Open in new tab ↗
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowClassicPreview(false);
                        if (!rxEditor?.embeddable) handleOpenInReactiveResume();
                      }}
                      disabled={openingInBuilder}
                      style={styles.primaryButton}
                    >
                      {openingInBuilder ? "Loading editor…" : rxEditor?.embeddable ? "Back to editor" : "Load editor"}
                    </button>
                  </div>
                </div>
                {openingInBuilder && !rxEditor && (
                  <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--rq-text-2)", fontSize: 13, border: "1px dashed color-mix(in srgb, var(--rq-text) 12%, transparent)", borderRadius: 8 }}>
                    Loading the resume editor…
                  </div>
                )}
                {rxEditor && !rxEditor.embeddable && (
                  <p style={{ fontSize: 13, color: "var(--rq-text-2)" }}>
                    This Reactive Resume instance (rxresu.me) can't be shown inside ResumeIQ. Set RXRESUME_URL to a self-hosted copy, or{" "}
                    <a href={rxEditor.builderUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--rq-info)" }}>open it in a new tab ↗</a>.
                  </p>
                )}
                {openInBuilderError && (
                  // The editor is optional: when it can't load, the classic editor below still covers editing and PDF export.
                  <p style={{ fontSize: 13, color: "var(--rq-text-2)", margin: "4px 0 0" }}>
                    The design editor isn't available right now — you can edit your resume and download it as a PDF below.
                  </p>
                )}
              </div>

              <details open={showClassicPreview || !!openInBuilderError} style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid color-mix(in srgb, var(--rq-text) 8%, transparent)" }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--rq-text-2)" }}>Classic editor &amp; PDF formatting</summary>
                <div style={{ maxWidth: 640, margin: "16px auto 0" }}>
                  <ResumeDocument
                    resume={getFinalResume()}
                    editable
                    onEdit={resumeEditHandlers}
                  />
                </div>
              <div style={{ marginTop: 24 }}>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 15 }}>
                  PDF formatting
                </div>
                <p style={{ margin: "0 0 14px", color: "var(--rq-text-2)", fontSize: 13 }}>
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
                          style={{ width: 64, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--rq-border)" }}
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
                          style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid var(--rq-border)", minWidth: 100 }}
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
                        style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid var(--rq-border)", minWidth: 140 }}
                      >
                        <option value="multi">Multiple pages (page break)</option>
                        <option value="single">Single page (scale to fit)</option>
                      </select>
                    </label>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--rq-text-3)" }}>
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
                        style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--rq-border)", borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={pdfFormat.fontColor || "#000000"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, fontColor: e.target.value }))}
                        placeholder="var(--rq-text)"
                        style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--rq-border)", fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 6 }}>
                      <span style={{ flex: "1 1 100px" }}>Background</span>
                      <input
                        type="color"
                        value={typeof pdfFormat.backgroundColor === "string" && pdfFormat.backgroundColor.startsWith("#") ? pdfFormat.backgroundColor : "#ffffff"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, backgroundColor: e.target.value }))}
                        style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--rq-border)", borderRadius: 4 }}
                      />
                      <input
                        type="text"
                        value={pdfFormat.backgroundColor || "#ffffff"}
                        onChange={(e) => setPdfFormat((f) => ({ ...f, backgroundColor: e.target.value }))}
                        placeholder="#ffffff"
                        style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--rq-border)", fontSize: 12 }}
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
                          style={{ width: 36, height: 28, padding: 0, border: "1px solid var(--rq-border)", borderRadius: 4 }}
                        />
                        <input
                          type="text"
                          value={pdfFormat.dividerColor || "#c8d0da"}
                          onChange={(e) => setPdfFormat((f) => ({ ...f, dividerColor: e.target.value }))}
                          placeholder="#c8d0da"
                          style={{ width: 80, padding: "4px 6px", borderRadius: 4, border: "1px solid var(--rq-border)", fontSize: 12 }}
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
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--rq-text-3)" }}>
                      Shows Skills in the right column below contact, so the main body has more room.
                    </p>
                    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 600, fontSize: 12 }}>
                      Section order
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--rq-text-2)" }}>
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

              </details>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18, alignItems: "center" }}>
                <button
                  type="button"
                  style={{
                    ...styles.primaryButton,
                    background: "color-mix(in srgb, var(--rq-accent) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--rq-accent) 50%, transparent)",
                    color: "var(--rq-accent)",
                  }}
                  onClick={async () => {
                    track("classic_pdf_downloaded");
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

