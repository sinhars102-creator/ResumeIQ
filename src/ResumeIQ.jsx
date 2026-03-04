import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { jsPDF } from "jspdf";

// PDF.js worker for text extraction (Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || "";

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

const JOB_DATABASE = [
  {
    id: "stripe-pm",
    company: "Stripe",
    role: "Senior Product Manager",
    location: "San Francisco, CA · Remote OK",
    salary: "$180k–$230k",
    badge: "Hot",
    source: "seed",
    jd:
      "Stripe is building the economic infrastructure that powers the internet. As a Senior Product Manager on our Payments Optimization team, you will own the roadmap for experiences that help high-growth businesses increase conversion, expand globally, and manage risk with confidence. You will partner closely with engineering, data science, and design to define strategy, ship experiments, and measure impact across a complex, distributed platform.\n\nIn this role, you’ll dive deep into payment performance data, identify friction points across checkout, authorization, and fraud, and turn insights into a prioritized roadmap. You’ll work directly with strategic customers to understand their needs and translate them into clear product requirements and narratives. You’ll write crisp product specs, align stakeholders across go-to-market and operations, and ensure every launch is supported with thoughtful rollout plans and documentation.\n\nThe ideal candidate has experience building B2B SaaS or platform products, is comfortable reasoning from both qualitative and quantitative signals, and can communicate complex technical concepts to both executives and engineers. You are opinionated yet low-ego, capable of driving alignment in ambiguous spaces, and motivated by seeing measurable improvements in key business metrics. Experience in payments, fintech, or marketplaces is a plus but not required. You should be excited to join a highly collaborative, fast-moving team that values craft, curiosity, and continuous learning.",
  },
  {
    id: "notion-staff",
    company: "Notion",
    role: "Staff Software Engineer – Platform",
    location: "New York, NY · Hybrid",
    salary: "$200k–$260k",
    badge: "Urgent",
    source: "seed",
    jd:
      "Notion’s mission is to make toolmaking ubiquitous. As a Staff Software Engineer on our Platform team, you will shape the foundational systems that power how millions of people think, collaborate, and build software in Notion every day. You’ll work across our product surface area to create primitives, APIs, and abstractions that enable other teams to ship delightful experiences quickly and safely.\n\nIn this role, you’ll lead the design and implementation of highly reliable, observable services that support complex workflows, real-time collaboration, and integrations with the broader productivity ecosystem. You’ll partner with product, design, security, and infra to make thoughtful trade-offs between flexibility, performance, and simplicity. You’ll set technical direction for key initiatives, mentor engineers across multiple teams, and raise the bar for code quality and technical rigor.\n\nYou are comfortable moving between high-level architectural discussions and deep dives into performance bottlenecks. You have experience evolving large-scale codebases, paying down technical debt, and building systems that are easy to extend. You care deeply about developer experience and believe great APIs feel almost invisible. Experience with TypeScript, React, and distributed systems is helpful, but we care more about your ability to learn quickly and collaborate effectively. This role is ideal for someone who wants to have outsized impact on both the product surface area and the infrastructure that underlies it.",
  },
  {
    id: "figma-designer",
    company: "Figma",
    role: "Product Designer – Growth",
    location: "Remote · US",
    salary: "$150k–$195k",
    badge: "New",
    source: "seed",
    jd:
      "Figma is where teams design, prototype, and build products together. As a Product Designer on our Growth team, you will craft experiences that help millions of designers, developers, and product thinkers discover value in Figma faster and return to it more often. You’ll work at the intersection of product, marketing, and data to design thoughtful flows that feel personal, inviting, and deeply useful.\n\nYou’ll own projects from opportunity discovery through polished execution: exploring new ideas alongside research and data science, developing flows and interaction patterns, and partnering with engineering to ship experiments that measurably improve activation, collaboration, and retention. You’ll design across the product surface area, from onboarding and invitations to sharing, notifications, and in-product education, always with an eye toward clarity, craft, and coherence.\n\nThe ideal candidate has experience designing for complex products, is comfortable working in fast-paced, experiment-driven environments, and brings strong systems thinking to every problem. You are adept at telling a story with your work, communicating clearly with stakeholders, and using both qualitative and quantitative signals to iterate. You care deeply about typography, hierarchy, and accessibility, and you’re excited to collaborate with a world-class team of designers and engineers. Familiarity with growth, self-serve SaaS, or collaboration tools is helpful but not required.",
  },
];

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
    } else if (badge === "New" || badge === "Remote") {
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
      return 4;
    case "suggestions":
      return 5;
    case "preview":
      return 6;
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

async function callOpenAI(system, user, maxTokens) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OpenAI API key");
  }
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = data?.error?.message || data?.message || `OpenAI API error ${response.status}`;
    throw new Error(errMsg);
  }
  const text = data?.choices?.[0]?.message?.content;
  return text || "";
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
    const text = await callOpenAI(system, user, 1000);
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

async function extractResumeFromText(pastedText) {
  try {
    const system =
      "You are a resume parser. Extract structured data from resume text. Return ONLY valid JSON, no markdown, no explanation.";
    const user = `Extract the following from this resume text and return ONLY a JSON object with this exact structure (use empty strings or empty arrays where info is missing):

{
  "name": "full name",
  "title": "current or most recent job title",
  "contact": "email, phone, location, LinkedIn — one line",
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

Resume text:
${pastedText}`;
    const text = await callOpenAI(system, user, 1500);
    if (!text || typeof text !== "string") {
      throw new Error("OpenAI returned no content. Check your API key and quota.");
    }
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      name: parsed.name || "Unknown",
      title: parsed.title || "",
      contact: parsed.contact || "",
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

async function scoreResume(job, resumeData) {
  const fallback = {
    score: 78,
    label: "Strong Match",
    summary:
      "Your product background aligns well with the responsibilities of this role, especially around cross-functional collaboration and roadmap ownership. Strengthening quantified impact and tailoring language to the specific domain could further increase your competitiveness.",
    breakdown: {
      skills: 20,
      experience: 21,
      impact: 18,
      keywords: 19,
    },
    keyGaps: [
      "Limited quantified metrics tied directly to revenue, conversion, or retention.",
      "Few references to experimentation frameworks (A/B testing, experimentation platforms).",
      "Domain language is generic rather than tailored to this company’s product surface.",
    ],
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
${JSON.stringify(resumeData, null, 2)}`;
    const text = await callOpenAI(system, user, 900);
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
    console.error("Score error, using fallback:", e);
    return fallback;
  }
}

async function generateSuggestions(job, resumeData, userContext) {
  const fallback = [
    {
      id: "s1",
      section: "Summary",
      type: "Rewrite",
      title: "Make summary more impact-focused for growth-oriented PM roles",
      original:
        resumeData.summary ||
        "Product manager with 4 years of experience building consumer and B2B products.",
      proposed:
        "Product manager with 4+ years owning roadmap and execution for B2B analytics and mobile products, partnering with design, engineering, and go-to-market teams to ship experiences that increase adoption, retention, and revenue.",
      why:
        "This reframing keeps your experience accurate while emphasizing ownership, cross-functional leadership, and business outcomes that align with high-growth product teams.",
    },
    {
      id: "s2",
      section: "Experience",
      type: "Rewrite",
      title: "Quantify impact of analytics dashboard work",
      original:
        "Managed product roadmap for a B2B analytics dashboard used by 200+ companies",
      proposed:
        "Owned roadmap for a B2B analytics dashboard used by 200+ companies, improving feature adoption by ~20% and helping expand ARR through upsell into higher tiers.",
      why:
        "Adding directional metrics and explicit impact makes this bullet more compelling without inventing new facts.",
    },
    {
      id: "s3",
      section: "Experience",
      type: "Addition",
      title: "Highlight experimentation and data-informed decision making",
      original: "",
      proposed:
        "Partnered with data science to design and analyze experiments, using A/B tests and cohort analysis to prioritize features and deprecate low-impact functionality.",
      why:
        "Experimentation experience is frequently requested in senior product roles and reinforces your ability to make data-informed decisions.",
    },
    {
      id: "s4",
      section: "Skills",
      type: "Rewrite",
      title: "Group skills into clearer themes",
      original: resumeData.skills.join(", "),
      proposed:
        "Product strategy & roadmapping · User research & discovery · Experimentation & A/B testing · Analytics & SQL · Design collaboration (Figma) · Agile/Scrum & stakeholder communication",
      why:
        "Clustering related skills into themes makes them easier to skim and connects them directly to how you work day-to-day.",
    },
    {
      id: "s5",
      section: "Experience",
      type: "Rewrite",
      title: "Clarify ownership at MidSize Corp",
      original:
        "Assisted senior PMs with writing product specs and user stories",
      proposed:
        "Collaborated with senior PMs to draft product specs and user stories, increasingly taking ownership of smaller feature areas from discovery through release.",
      why:
        "This preserves your level while signaling growing ownership, which is attractive for companies hiring beyond entry-level roles.",
    },
  ];
  try {
    const system =
      "You are an expert resume writer. Return ONLY a valid JSON array, no markdown.";
    const expCount = (resumeData.experience || []).length;
    const contextBlock = userContext && String(userContext).trim()
      ? `\nThe candidate wants to emphasize or add the following. Use this to tailor suggestions and proposed bullet text—weave it into rewrites or new bullets where relevant:\n"${String(userContext).trim()}"\n\n`
      : "";
    const user = `Given the job description and resume below, propose edit suggestions that make the resume more compelling for this role.${contextBlock}

Read ALL ${expCount} experience(s) and every bullet. Suggest changes ONLY where they are needed: skip bullets that are already strong and well-aligned. Do not exhaust the list—suggest Rewrite only for weak or off-target bullets, Removal for redundant or low-value ones, and Addition only when it clearly adds value. Aim for a small, high-value set (e.g. 5–12 suggestions total), not one per bullet.

Each suggestion MUST be an object with this exact shape:
{
  "id": "short-unique-id",
  "section": "Summary | Experience | Education | Skills | Other",
  "type": "Rewrite | Addition | Removal",
  "title": "Short human-readable title",
  "original": "Original text (exact bullet or text; empty string for Addition)",
  "proposed": "Proposed revised or added text (empty string for Removal)",
  "why": "Short explanation of why this helps",
  "experienceIndex": 0
}

For Experience suggestions ONLY: include "experienceIndex" (0-based), the index of the job in the resume experience array (0 = first job, 1 = second job, etc.).

Rules:
- Do NOT change factual details: company names, dates, job titles, schools, degrees, or numeric facts.
- When proposing bullet text (Rewrite or Addition), include numbers and figures where plausible (e.g. percentages, scale, time saved, revenue impact, team size). Use approximate or directional metrics if exact ones are unknown.
- Cover all experiences but suggest only where improvement is needed; leave good bullets unchanged.
- Final resume: at most 3 bullets per job—suggest Removal or merging for long lists.
- Keep each suggestion and "why" brief to save tokens.

Job description:
${job.jd}

Resume JSON:
${JSON.stringify(resumeData, null, 2)}`;
    const text = await callOpenAI(system, user, 2000);
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || !parsed.length) return fallback;
    return parsed.slice(0, 40).map((s, idx) => ({
      id: s.id || `s-${idx + 1}`,
      section: s.section || "Other",
      type: s.type || "Rewrite",
      title: s.title || `Suggestion ${idx + 1}`,
      original: s.original ?? "",
      proposed: s.proposed ?? "",
      why:
        s.why ||
        "This improves clarity and alignment with the responsibilities described in the job posting.",
      experienceIndex: typeof s.experienceIndex === "number" ? s.experienceIndex : 0,
    }));
  } catch (e) {
    console.error("Suggestions error, using fallback:", e);
    return fallback;
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
      if (proposed && typeof proposed === "string") resume.summary = proposed;
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
          targetExp.bullets.push(proposed.trim());
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
  const photoGap = (format.photoGapMm ?? 10) * scale;
  const photoW = (format.photoWidthMm ?? PHOTO_WIDTH_MM) * scale;
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
  if (photoDataUrl && typeof photoDataUrl === "string") {
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
  const photoW = m(format.photoWidthMm);
  const photoH = m(format.photoWidthMm * (4 / 3));
  const photoGap = m(format.photoGapMm);
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
        <img
          src={resume.photoUrl || "/resume-photo.png"}
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

function ResumeDocument({ resume, highlights = [], dim = false, afterMode = false }) {
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

  const photoUrl = resume.photoUrl || "/resume-photo.png";

  return (
    <div
      style={{
        ...styles.resumePaper,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div style={styles.resumeHeaderRow}>
        <img
          src={photoUrl}
          alt=""
          style={styles.resumePhoto}
          onError={(e) => { e.target.style.display = "none"; }}
        />
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

const DEFAULT_PARSING_STATUS = { extractText: false, parseStructure: false, findJobs: false };

export default function ResumeIQ() {
  const [step, setStep] = useState("upload");
  const [jobs, setJobs] = useState(JOB_DATABASE);
  const [selectedJob, setSelectedJob] = useState(null);
  const [resume, setResume] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [extractingResume, setExtractingResume] = useState(false);
  const [readingPdf, setReadingPdf] = useState(false);
  const [linkedInText, setLinkedInText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [linkedInSearchKeywords, setLinkedInSearchKeywords] = useState("Product Manager");
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
  const [rejectedIds, setRejectedIds] = useState(() => new Set());
  const [updatedResume, setUpdatedResume] = useState(null);
  const [previewHighlights, setPreviewHighlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [hoveredJobId, setHoveredJobId] = useState(null);
  const [pdfFormat, setPdfFormat] = useState(() => ({ ...DEFAULT_PDF_FORMAT }));
  const [regenerationContext, setRegenerationContext] = useState("");
  const [regeneratingSuggestions, setRegeneratingSuggestions] = useState(false);
  const [skillsEditText, setSkillsEditText] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current !== "preview" && step === "preview") {
      const data = updatedResume || resume;
      setSkillsEditText((data.skills || []).join(" · "));
    }
    prevStepRef.current = step;
  }, [step, updatedResume, resume]);

  const handleJobAnalyzeClick = (job) => {
    setSelectedJob(job);
    setStep("analyze");
    setScore(null);
    setScoreBreakdown(null);
    setSuggestions([]);
    setApprovedIds(new Set());
    setRejectedIds(new Set());
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

  const handleSearchLinkedInJobs = async () => {
    setLinkedInSearchError(null);
    setLinkedInSearching(true);
    try {
      const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
      const location = linkedInSearchIndiaOnly ? "India" : (linkedInSearchLocation.trim() || "India");
      const params = new URLSearchParams({
        keywords: linkedInSearchKeywords.trim() || "Product Manager",
        location,
        limit: String(linkedInSearchLimit),
      });
      const res = await fetch(`${base}/api/linkedin-jobs?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLinkedInSearchError(data.error || data.details || `Search failed (${res.status})`);
        return;
      }
      const newJobs = (data.jobs || []).map((j) => ({ ...j, source: "linkedin" }));
      setJobs((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        const added = newJobs.filter((j) => !ids.has(j.id));
        added.forEach((j) => ids.add(j.id));
        return [...prev, ...added];
      });
    } catch (e) {
      setLinkedInSearchError(e.message || "Search failed");
    } finally {
      setLinkedInSearching(false);
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
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      let fullText = "";
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) => item.str || "").filter(Boolean);
        fullText += strings.join(" ") + "\n";
      }
      return fullText.trim();
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

    try {
      const text = await readFileToText(file);
      setParsingStatus((s) => ({ ...s, extractText: true }));

      const extracted = await extractResumeFromText(text);
      setResume(extracted);
      setResumeText(text);
      setParsingStatus((s) => ({ ...s, parseStructure: true }));

      const keywords = (extracted.title || "").trim() || "Product Manager";
      const location = linkedInSearchIndiaOnly ? "India" : (linkedInSearchLocation.trim() || "India");
      const base = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
      const params = new URLSearchParams({ keywords, location, limit: String(linkedInSearchLimit) });
      const res = await fetch(`${base}/api/linkedin-jobs?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.jobs) && data.jobs.length) {
        setJobs((prev) => {
          const ids = new Set(prev.map((x) => x.id));
          const added = (data.jobs || []).filter((j) => !ids.has(j.id));
          added.forEach((j) => ids.add(j.id));
          return [...prev, ...added.map((j) => ({ ...j, source: "linkedin" }))];
        });
      } else if (!res.ok) {
        setParsingError(data.details || data.error || "Could not fetch jobs");
      }
      setStep("select");
    } catch (err) {
      console.error("Upload/parse error:", err);
      const msg = err.message || "Something went wrong";
      const isNetwork = /fetch failed|failed to fetch|network error|connection refused/i.test(msg);
      setParsingError(
        isNetwork
          ? "Could not reach the server. Start it with: npm run dev:all"
          : /openai|api key|quota/i.test(msg)
            ? "Resume extraction failed. Check your OpenAI API key (Vercel env: VITE_OPENAI_API_KEY) and try again."
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

  const handleAnalyzeResume = async () => {
    if (!selectedJob) return;
    const resumeToUse = resume || SAMPLE_RESUME;
    setLoading(true);
    setLoadingMsg("Scoring your resume against this job…");
    try {
      const scoreData = await scoreResume(selectedJob, resumeToUse);
      setScore(scoreData.score);
      setScoreBreakdown(scoreData);
      setLoadingMsg("Generating tailored suggestions…");
      const suggs = await generateSuggestions(selectedJob, resumeToUse);
      setSuggestions(suggs);
      setApprovedIds(new Set());
      setRejectedIds(new Set());
      setStep("suggestions");
    } catch (e) {
      console.error("Analyze resume error:", e);
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setJobs(JOB_DATABASE);
    setSelectedJob(null);
    setResume(null);
    setScore(null);
    setScoreBreakdown(null);
    setSuggestions([]);
    setApprovedIds(new Set());
    setRejectedIds(new Set());
    setUpdatedResume(null);
    setPreviewHighlights([]);
    setLinkedInText("");
    setRegenerationContext("");
    setUploadedFileName("");
    setUploadedFileSize("");
    setParsingStatus({ ...DEFAULT_PARSING_STATUS });
    setParsingError(null);
    setLoading(false);
    setLoadingMsg("");
    setApplyingChanges(false);
  };

  const toggleApprove = (id) => {
    setApprovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleReject = (id) => {
    setRejectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setApprovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  function handleApproveAll() {
    if (approvedIds.size === suggestions.length) {
      setApprovedIds(new Set());
    } else {
      setApprovedIds(new Set(suggestions.map((s) => s.id)));
      setRejectedIds(new Set());
    }
  }

  const allApproved =
    suggestions.length > 0 && approvedIds.size === suggestions.length;

  const handleApplyChanges = async () => {
    if (!approvedIds.size) return;
    setApplyingChanges(true);
    try {
      const approved = suggestions.filter((s) => approvedIds.has(s.id));
      const newResume = applyApprovedChangesClientSide(resume, approved);
      setUpdatedResume(newResume);

      const highlightPhrases = approved
        .map((s) => s.proposed)
        .filter((t) => typeof t === "string" && t.trim().length > 0);
      setPreviewHighlights(highlightPhrases);
      setStep("preview");
    } catch (e) {
      console.error("Apply changes failed:", e);
    } finally {
      setApplyingChanges(false);
    }
  };

  const handleRegenerateSuggestions = async () => {
    if (!selectedJob || !resume) return;
    setRegeneratingSuggestions(true);
    try {
      const suggs = await generateSuggestions(selectedJob, resume, regenerationContext);
      setSuggestions(suggs);
      setApprovedIds(new Set());
      setRejectedIds(new Set());
    } catch (e) {
      console.error("Regenerate suggestions failed:", e);
    } finally {
      setRegeneratingSuggestions(false);
    }
  };

  const updateSuggestionProposed = (id, value) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, proposed: value } : s))
    );
  };

  const updateSuggestionOriginal = (id, value) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, original: value } : s))
    );
  };

  const getFinalResume = () => updatedResume || resume;
  const setFinalResume = (next) => setUpdatedResume(next);

  const updateFinalSummary = (value) => {
    const next = JSON.parse(JSON.stringify(getFinalResume()));
    next.summary = value;
    setFinalResume(next);
  };
  const updateFinalBullet = (expIdx, bulletIdx, value) => {
    const next = JSON.parse(JSON.stringify(getFinalResume()));
    if (!next.experience?.[expIdx]) return;
    next.experience[expIdx].bullets = next.experience[expIdx].bullets || [];
    next.experience[expIdx].bullets[bulletIdx] = value;
    setFinalResume(next);
  };
  const removeFinalBullet = (expIdx, bulletIdx) => {
    const next = JSON.parse(JSON.stringify(getFinalResume()));
    if (!next.experience?.[expIdx]?.bullets) return;
    next.experience[expIdx].bullets.splice(bulletIdx, 1);
    setFinalResume(next);
  };
  const addFinalBullet = (expIdx) => {
    const next = JSON.parse(JSON.stringify(getFinalResume()));
    if (!next.experience?.[expIdx]) return;
    next.experience[expIdx].bullets = next.experience[expIdx].bullets || [];
    next.experience[expIdx].bullets.push("");
    setFinalResume(next);
  };
  const updateFinalSkills = (value) => {
    const next = JSON.parse(JSON.stringify(getFinalResume()));
    next.skills = value.split(/[,·|]|\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
    setFinalResume(next);
  };

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
          {clamped}
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
                { id: "analyze", num: 4, label: "Resume" },
                { id: "suggestions", num: 5, label: "Suggestions" },
                { id: "preview", num: 6, label: "Preview" },
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
                    {idx < 5 && <span style={styles.stepArrow}>→</span>}
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
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Your Job Matches</h2>
                <p style={styles.sectionSubtitle}>
                  Jobs matched to your profile. Pick one to analyze fit and get tailored suggestions.
                </p>
              </div>
              {parsingError && (
                <div style={{ marginBottom: 16, padding: 10, background: "rgba(245,200,66,0.1)", borderRadius: 8, fontSize: 12, color: "#f5c842" }}>
                  {parsingError}. You can add roles manually below.
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
                    onClick={handleSearchLinkedInJobs}
                  >
                    {linkedInSearching ? "Searching…" : "Search LinkedIn"}
                  </button>
                </div>
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

              <div style={styles.jobGrid}>
                {jobs.map((job) => {
                  const hovered = hoveredJobId === job.id;
                  return (
                    <div
                      key={job.id}
                      style={styles.jobCard(hovered)}
                      onMouseEnter={() => setHoveredJobId(job.id)}
                      onMouseLeave={() => setHoveredJobId(null)}
                      onClick={() => handleJobAnalyzeClick(job)}
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
                        <div style={styles.badgePill(job.badge)}>
                          {job.badge}
                        </div>
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
                          Analyze My Fit →
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

          {step === "analyze" && (
            <section style={styles.stepSection}>
              <div style={styles.backRow}>
                <div style={styles.backLabelRow}>
                  <button
                    type="button"
                    style={styles.smallBackButton}
                    onClick={() => setStep("select")}
                  >
                    ← Back to Job Matches
                  </button>
                  <div>
                    <div style={styles.backText}>Analyzing for</div>
                    <div style={styles.analyzeTitle}>
                      {selectedJob
                        ? `${selectedJob.role} @ ${selectedJob.company}`
                        : "Select a job"}
                    </div>
                  </div>
                </div>
              </div>

              <div style={styles.twoColumn}>
                <div style={styles.colLeft}>
                  <ResumeDocument resume={resume || SAMPLE_RESUME} />
                </div>
                <aside style={styles.colRightFixed}>
                  <div style={styles.sideCard}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={styles.avatarCircle}>
                        {(resume || SAMPLE_RESUME).name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <div style={styles.resumeName}>{(resume || SAMPLE_RESUME).name}</div>
                        <div style={styles.resumeTitle}>{(resume || SAMPLE_RESUME).title}</div>
                      </div>
                    </div>
                  </div>

                  <div style={styles.sideCard}>
                    <div
                      style={{
                        ...styles.panelLabel,
                        marginBottom: 6,
                      }}
                    >
                      Job Description
                    </div>
                    <div style={styles.jdScrollBox}>
                      {selectedJob ? selectedJob.jd : "No job selected."}
                    </div>
                  </div>

                  <div style={styles.sideCard}>
                    <button
                      type="button"
                      style={{
                        ...styles.primaryButton,
                        width: "100%",
                        justifyContent: "center",
                        ...(loading ? styles.disabledButton : {}),
                      }}
                      disabled={loading}
                      onClick={handleAnalyzeResume}
                    >
                      ⚡ Analyze My Resume
                    </button>
                    {loading && (
                      <div style={{ marginTop: 8 }}>
                        <span style={styles.monoStatus}>{loadingMsg}</span>
                      </div>
                    )}
                    {!loading && score != null && (
                      <div style={{ marginTop: 8 }}>
                        <span style={styles.monoStatus}>
                          Last score: {score}/100
                        </span>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          )}

          {step === "suggestions" && (
            <section style={styles.stepSection}>
              <div style={styles.backRow}>
                <button
                  type="button"
                  style={styles.smallBackButton}
                  onClick={() => setStep("analyze")}
                >
                  ← Back to Resume
                </button>
                <div style={styles.analyzeTitle}>
                  {selectedJob
                    ? `${selectedJob.role} @ ${selectedJob.company}`
                    : "Suggestions"}
                </div>
              </div>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>Your Match & Roadmap</h2>
                <p style={styles.sectionSubtitle}>
                  Review how closely your current story fits this role, then
                  selectively apply edits that keep every fact intact.
                </p>
              </div>

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
                            {breakdown.summary ||
                              "We estimate your experience is directionally aligned with this role. Targeted edits below can further sharpen the match and make impact easier to see at a glance."}
                          </div>
                          <div style={styles.breakdownGrid}>
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
                          </div>
                          <div style={styles.keyGapsTitle}>Key Gaps</div>
                          <ul style={styles.keyGapsList}>
                            {(keyGaps && keyGaps.length
                              ? keyGaps.slice(0, 3)
                              : [
                                  "Clarify quantified impact using directional or approximate metrics.",
                                  "Surface experimentation, testing, or measurement where relevant.",
                                  "Dial in language to mirror terms used in the job description.",
                                ]
                            ).map((gap, idx) => (
                              <li key={idx}>⚠ {gap}</li>
                            ))}
                          </ul>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div style={styles.suggestionsHeaderRow}>
                <div>
                  <h3
                    style={{
                      ...styles.sectionTitle,
                      fontSize: 20,
                      marginBottom: 2,
                    }}
                  >
                    Tailored Suggestions
                  </h3>
                  <p style={styles.sectionSubtitle}>
                    Review each suggestion. We won't change any facts about your
                    resume.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApproveAll}
                  style={{
                    ...styles.ghostButton,
                    border: allApproved
                      ? "1px solid rgba(0,229,160,0.5)"
                      : "1px solid #333",
                    color: allApproved ? "#00e5a0" : "#888",
                    whiteSpace: "nowrap",
                  }}
                >
                  {allApproved ? "✓ All Approved" : "Approve All"}
                </button>
              </div>

              <div
                style={{
                  marginBottom: 20,
                  padding: 16,
                  background: "rgba(0,0,0,0.03)",
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                  Regenerate with more context
                </div>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "#555" }}>
                  Add details you want to emphasize (e.g. "I have worked extensively in omni-channel setup"). We'll generate new suggestions and bullet text that incorporate this.
                </p>
                <textarea
                  value={regenerationContext}
                  onChange={(e) => setRegenerationContext(e.target.value)}
                  placeholder="e.g. I have worked extensively in omni-channel setup, or: Led cross-functional teams across 3 regions…"
                  rows={3}
                  style={{
                    width: "100%",
                    maxWidth: 560,
                    padding: 10,
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={handleRegenerateSuggestions}
                    disabled={regeneratingSuggestions}
                    style={{
                      ...styles.primaryButton,
                      opacity: regeneratingSuggestions ? 0.7 : 1,
                    }}
                  >
                    {regeneratingSuggestions ? "Regenerating…" : "Regenerate suggestions with this context"}
                  </button>
                </div>
              </div>

              <div style={styles.suggestionsList}>
                {suggestions.map((s) => {
                  const approved = approvedIds.has(s.id);
                  const rejected = rejectedIds.has(s.id);
                  const state = approved
                    ? "approved"
                    : rejected
                    ? "rejected"
                    : "default";
                  const isAddition = !s.original;
                  return (
                    <div key={s.id} style={styles.suggestionCard(state)}>
                      <div style={styles.suggestionTopRow}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <div style={styles.sectionPill}>{s.section}</div>
                          <div style={styles.typePill}>{s.type}</div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          <button
                            type="button"
                            style={styles.dangerButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReject(s.id);
                            }}
                          >
                            ✕ Reject
                          </button>
                          <button
                            type="button"
                            style={styles.successButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleApprove(s.id);
                            }}
                          >
                            ✓ Approve
                          </button>
                        </div>
                      </div>
                      <div style={styles.suggestionTitle}>{s.title}</div>
                      <div style={styles.diffBlock}>
                        {isAddition ? (
                          <>
                            <div style={styles.diffLabel}>Add to Resume (editable)</div>
                            <textarea
                              value={s.proposed}
                              onChange={(e) => updateSuggestionProposed(s.id, e.target.value)}
                              rows={3}
                              style={{
                                width: "100%",
                                padding: 8,
                                borderRadius: 4,
                                border: "1px solid rgba(0,229,160,0.4)",
                                fontSize: 13,
                                background: "rgba(0,229,160,0.06)",
                                color: "#fff",
                                resize: "vertical",
                                boxSizing: "border-box",
                              }}
                            />
                          </>
                        ) : (
                          <>
                            <div style={styles.diffLabel}>Before (editable)</div>
                            <textarea
                              value={s.original}
                              onChange={(e) => updateSuggestionOriginal(s.id, e.target.value)}
                              rows={2}
                              style={{
                                width: "100%",
                                padding: 8,
                                borderRadius: 4,
                                border: "1px solid rgba(255,100,100,0.3)",
                                fontSize: 13,
                                background: "rgba(255,100,100,0.05)",
                                color: "#fff",
                                resize: "vertical",
                                boxSizing: "border-box",
                              }}
                            />
                            <div style={{ ...styles.diffLabel, marginTop: 6 }}>After (editable)</div>
                            <textarea
                              value={s.proposed}
                              onChange={(e) => updateSuggestionProposed(s.id, e.target.value)}
                              rows={3}
                              style={{
                                width: "100%",
                                padding: 8,
                                borderRadius: 4,
                                border: "1px solid rgba(0,229,160,0.4)",
                                fontSize: 13,
                                background: "rgba(0,229,160,0.06)",
                                color: "#fff",
                                resize: "vertical",
                                boxSizing: "border-box",
                              }}
                            />
                          </>
                        )}
                      </div>
                      <div style={styles.whyLine}>💡 {s.why}</div>
                    </div>
                  );
                })}
              </div>

              <div style={styles.suggestionsFooterRow}>
                <div>
                  {approvedCount
                    ? `${approvedCount} suggestion(s) approved`
                    : "Select suggestions to apply"}
                </div>
                <button
                  type="button"
                  onClick={handleApplyChanges}
                  disabled={!approvedCount || applyingChanges}
                  style={{
                    ...styles.primaryButton,
                    ...(!approvedCount || applyingChanges
                      ? styles.disabledButton
                      : {}),
                  }}
                >
                  Apply {approvedCount || 0} Changes →
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
                      } applied to the AFTER version.`
                    : "Preview your original resume alongside an updated version with suggested edits."}
                </p>
              </div>

              <div style={styles.previewLayout}>
                <div style={styles.previewColumn}>
                  <div style={styles.previewLabelRow}>
                    <span style={styles.previewLabel}>Before</span>
                  </div>
                  <ResumeDocument resume={resume} dim />
                </div>
                <div style={styles.previewColumn}>
                  <div style={styles.previewLabelRow}>
                    <span style={styles.previewAfterLabel}>
                      AFTER ✓ <span>Highlighting applied text</span>
                    </span>
                  </div>
                  <ResumeDocument
                    resume={updatedResume || resume}
                    highlights={previewHighlights}
                    afterMode
                  />
                </div>
              </div>

              <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>
                  Edit final version
                </div>
                <p style={{ margin: "0 0 14px", color: "#555", fontSize: 13 }}>
                  Remove bullets or edit text below. Changes apply to the version shown in the preview and in the downloaded PDF without breaking the layout.
                </p>
                {(() => {
                  const data = getFinalResume();
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 640 }}>
                      <div>
                        <label style={{ display: "block", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Summary</label>
                        <textarea
                          value={data.summary || ""}
                          onChange={(e) => updateFinalSummary(e.target.value)}
                          rows={4}
                          style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ccc", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                        />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Experience bullets</div>
                        {(data.experience || []).map((exp, expIdx) => (
                          <div key={expIdx} style={{ marginBottom: 16, padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{exp.role} · {exp.company}</div>
                            {(exp.bullets || []).map((bullet, bulletIdx) => (
                              <div key={bulletIdx} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
                                <textarea
                                  value={bullet}
                                  onChange={(e) => updateFinalBullet(expIdx, bulletIdx, e.target.value)}
                                  rows={2}
                                  style={{ flex: 1, padding: 8, borderRadius: 4, border: "1px solid #ccc", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                                />
                                <button
                                  type="button"
                                  onClick={() => removeFinalBullet(expIdx, bulletIdx)}
                                  style={{ ...styles.dangerButton, flexShrink: 0, padding: "8px 10px" }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => addFinalBullet(expIdx)}
                              style={{ ...styles.ghostButton, fontSize: 12 }}
                            >
                              + Add bullet
                            </button>
                          </div>
                        ))}
                      </div>
                      <div>
                        <label style={{ display: "block", fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Skills (comma or · separated; spaces allowed)</label>
                        <textarea
                          value={skillsEditText}
                          onChange={(e) => setSkillsEditText(e.target.value)}
                          onBlur={(e) => updateFinalSkills(e.target.value)}
                          rows={2}
                          placeholder="e.g. SCM, Inventory Management, Demand Planning"
                          style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ccc", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                        />
                      </div>
                    </div>
                  );
                })()}
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
                    const photoUrl = data?.photoUrl || "/resume-photo.png";
                    let photoDataUrl = null;
                    try {
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

