/**
 * Resume review for "Improve my resume" (Resume LLM): checks in plain code, grouped into categories,
 * each with a 0-100 strength, plus the issues to fix. Shared by the page (live strengths as edits are
 * applied) and the API (which has the model write the rewrites). No job description involved.
 *
 * An issue: { id, category, target, priority: "must" | "nice", title, why, fix, ... }
 *   fix "rewrite": the model rewrites the line (hint says what's wrong)
 *   fix "ask":     a question for the candidate; their answer becomes an edit (question)
 *   fix "edit":    a change made in code, ready to apply (edit)
 *   fix "action":  a bigger request sent to the chat ("make it 1 page") (action)
 */
import { getCandidateYears } from "./matchScore.js";

export const CATEGORIES = [
  { id: "basic", label: "Basic info", weight: 0.15 },
  { id: "summary", label: "Headline & summary", weight: 0.15 },
  { id: "experience", label: "Experience bullets", weight: 0.4 },
  { id: "skills", label: "Skills & certifications", weight: 0.2 },
  { id: "format", label: "Length & format", weight: 0.1 },
];

export const WEAK_START = /^(responsible for|worked( on| with| in)?|helped|assisted|handled|involved in|participated|tasked with|duties|in charge of|was |were |did |made |got |team player)/i;
const HAS_RESULT = /\d|%|₹|\$|€|£|\b(doubled|tripled|halved)\b/i;
const FIRST_PERSON = /\b(I|my|me|I'm|I've)\b/;
const SOFT_SKILLS = new Set(["communication", "communication skills", "teamwork", "team player", "leadership", "hardworking", "hard working", "hard-working", "problem solving", "problem-solving", "time management", "interpersonal skills", "interpersonal", "self-motivated", "self motivated", "quick learner", "fast learner", "dedicated", "punctual", "adaptability", "multitasking", "multi-tasking", "positive attitude", "critical thinking", "creativity"]);
// Tools an ATS looks for: listed in skills when the bullets already show them.
const TOOLS = ["SQL", "Python", "R", "Excel", "Power BI", "Tableau", "Looker", "Jira", "Confluence", "Figma", "Miro", "AWS", "Azure", "GCP", "Java", "JavaScript", "TypeScript", "React", "Node.js", "Docker", "Kubernetes", "Git", "Salesforce", "SAP", "HubSpot", "Google Analytics", "Mixpanel", "Amplitude", "Snowflake", "BigQuery", "Spark", "Kafka", "TensorFlow", "PyTorch", "Pandas", "Go", "C++", "C#", ".NET", "Spring Boot", "Django", "Flask", "MongoDB", "PostgreSQL", "MySQL", "Redis", "Terraform", "Jenkins", "Selenium", "A/B testing", "Agile", "Scrum"];

const words = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The contact line's parts: email, phone, LinkedIn, location. */
export function contactParts(contact) {
  const text = String(contact || "");
  const email = (text.match(/[^\s@·|,;<>()]+@[^\s@·|,;<>()]+\.[a-z]{2,}/i) || [""])[0];
  const phone = (text.match(/\+?\d[\d\s().-]{8,}\d/) || [""])[0];
  const linkedin = (text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/in\/[^\s·|,;]+/i) || [""])[0];
  const location = text
    .split(/[·|•;]|\s{2,}/)
    .map((p) => p.trim())
    .find((p) => p && !p.includes("@") && !/\d{5,}|linkedin|http|www\.|github/i.test(p) && /[a-z]{3,}/i.test(p)) || "";
  return { email, phone: phone.replace(/\D/g, "").length >= 10 ? phone : "", linkedin, location };
}

function periodStyle(period) {
  const p = String(period || "");
  if (/[A-Za-z]{3,}\.?\s*'?\d{2,4}/.test(p)) return "month-name";
  if (/\d{1,2}[/.-]\d{2,4}/.test(p)) return "numeric";
  if (/\d{4}/.test(p)) return "year";
  return null;
}

/**
 * Review a resume (removed bullets already dropped). `pages`: how many pages the PDF takes, when known.
 * Returns { overall, categories: [{ id, label, score, issues }], issues }.
 */
export function reviewResume(resume, { pages = null } = {}) {
  const r = resume || {};
  const issues = [];
  const add = (category, issue) => issues.push({ category, priority: "nice", ...issue, id: `${category}-${issues.length + 1}` });
  const scores = {};

  // ---- Basic info ----
  {
    const c = contactParts(r.contact);
    const checks = [!!String(r.name || "").trim(), !!c.email, !!c.phone, !!c.location, !!c.linkedin];
    if (!c.email) add("basic", { target: "C", priority: "must", fix: "ask", title: "Add your email", why: "Recruiters can't reach you without it, and many ATS reject resumes with no email.", question: "What email should recruiters use? I'll add it to your contact line." });
    else if (/\d{4,}/.test(c.email.split("@")[0])) add("basic", { target: "C", fix: "ask", title: "Use a simpler email", why: `"${c.email}" has a long string of numbers – a firstname.lastname style address looks more professional.`, question: "Do you have a simpler email (like firstname.lastname@…)? Type it and I'll swap it in, or skip." });
    if (!c.phone) add("basic", { target: "C", priority: "must", fix: "ask", title: "Add your phone number", why: "Most recruiters in India call first – a missing number loses calls.", question: "What phone number should recruiters call? Include +91 if you're in India." });
    if (!c.location) add("basic", { target: "C", fix: "ask", title: "Add your location", why: "Recruiters and ATS filters search by city; without one you can miss location-based searches.", question: "Which city are you based in (and are you open to relocating)?" });
    if (!c.linkedin) add("basic", { target: "C", fix: "ask", title: "Add your LinkedIn", why: "Most recruiters check LinkedIn before calling; a link saves them a search.", question: "What's your LinkedIn profile link (linkedin.com/in/…)?" });
    scores.basic = clamp((checks.filter(Boolean).length / checks.length) * 100 - (c.email && /\d{4,}/.test(c.email.split("@")[0]) ? 8 : 0));
  }

  // ---- Headline & summary ----
  {
    let score = 100;
    if (!String(r.title || "").trim()) {
      score -= 30;
      add("summary", { target: "T", priority: "must", fix: "ask", title: "Add a headline", why: "The line under your name is the first thing a recruiter reads in their ~7-second scan.", question: "What headline should go under your name? e.g. your current title and focus, like \"Product Manager · B2B SaaS\"." });
    }
    const summary = String(r.summary || "").trim();
    const n = words(summary);
    if (!summary) {
      score -= 45;
      add("summary", { target: "S", priority: "must", fix: "rewrite", hint: "summary_missing", title: "Add a short summary", why: "A 2-3 line summary tells the recruiter who you are before they read the details." });
    } else {
      const problems = [];
      if (n > 75) problems.push("too long");
      if (n < 18) problems.push("too short");
      if (FIRST_PERSON.test(summary)) problems.push("written in first person");
      if (!HAS_RESULT.test(summary) && n >= 18) problems.push("no concrete result or scope");
      score -= problems.length * 15;
      if (problems.length) add("summary", { target: "S", priority: n > 75 ? "must" : "nice", fix: "rewrite", hint: problems.join(", "), title: "Sharpen your summary", why: `Your summary is ${problems.join(", ")}. Aim for 2-3 lines, no "I", with your years, focus and one result.` });
    }
    scores.summary = clamp(score);
  }

  // ---- Experience bullets ----
  {
    const bulletScores = [];
    let roleProblems = 0;
    (r.experience || []).forEach((role, i) => {
      const bullets = (role.bullets || []).map((b, j) => ({ b, j })).filter((x) => x.b != null && String(x.b).trim());
      const at = [role.role, role.company].filter(Boolean).join(" at ");
      if (!String(role.period || "").trim()) {
        roleProblems++;
        add("experience", { target: `E${i}`, priority: "must", fix: "ask", title: `Add dates for ${at || "this role"}`, why: "Roles without dates look like gaps to recruiters and confuse ATS experience counts.", question: `When did you start${/present/i.test(role.period || "") ? "" : " and finish"} as ${at}? e.g. Jan 2021 – Mar 2023.` });
      }
      if (bullets.length < 2 && i < 3) {
        roleProblems++;
        add("experience", { target: `E${i}`, priority: i === 0 ? "must" : "nice", fix: "ask", title: `Say more about ${at || "this role"}`, why: "Recent roles need 3-5 bullets to show what you owned and what changed because of you.", question: `Tell me 2-3 things you did as ${at}: what you owned, and what improved because of it (numbers if you have them).` });
      }
      bullets.forEach(({ b, j }) => {
        const n = words(b);
        const problems = [];
        if (WEAK_START.test(String(b).trim())) problems.push("weak opening");
        if (!HAS_RESULT.test(b)) problems.push("no number or result");
        if (n > 32) problems.push("too long");
        if (n < 6) problems.push("too vague");
        bulletScores.push(1 - problems.length / 3);
        if (problems.length) {
          add("experience", {
            target: `E${i}B${j}`,
            priority: problems.length >= 2 || (problems.includes("no number or result") && i === 0) ? "must" : "nice",
            fix: "rewrite",
            hint: problems.join(", "),
            title: problems.includes("no number or result") ? "Show the result" : problems.includes("weak opening") ? "Start with a strong verb" : problems.includes("too long") ? "Tighten this bullet" : "Make this bullet specific",
            why: `This bullet has: ${problems.join(", ")}. Strong bullets start with an action verb and end with a result.`,
          });
        }
      });
    });
    const avg = bulletScores.length ? bulletScores.reduce((a, b) => a + b, 0) / bulletScores.length : 0;
    scores.experience = clamp(avg * 100 - roleProblems * 8);
  }

  // ---- Skills & certifications ----
  {
    let score = 100;
    const skills = (r.skills || []).map((s) => String(s).trim()).filter(Boolean);
    const seen = new Set();
    const unique = skills.filter((s) => (seen.has(s.toLowerCase()) ? false : seen.add(s.toLowerCase())));
    const hard = unique.filter((s) => !SOFT_SKILLS.has(s.toLowerCase()));
    if (unique.length < skills.length || hard.length < unique.length) {
      const removed = skills.length - hard.length;
      score -= 15;
      add("skills", { target: "K", fix: "edit", edit: { target: "K", op: "set_skills", skills: hard }, title: "Clean up your skills list", why: `Removes ${removed} ${unique.length < skills.length ? "duplicate or " : ""}soft skill${removed > 1 ? "s" : ""} (like communication or teamwork). ATS match hard skills; show soft skills through your bullets instead.` });
    }
    const body = `${r.summary || ""}\n${(r.experience || []).flatMap((e) => e.bullets || []).filter(Boolean).join("\n")}`;
    const have = new Set(hard.map((s) => s.toLowerCase()));
    const shown = TOOLS.filter((t) => !have.has(t.toLowerCase()) && new RegExp(`(^|[^a-z0-9])${escapeRe(t)}([^a-z0-9]|$)`, t.length <= 2 ? "" : "i").test(body));
    if (shown.length) {
      score -= Math.min(20, shown.length * 5);
      add("skills", { target: "K", priority: "must", fix: "edit", edit: { target: "K", op: "add_skills", skills: shown.slice(0, 8) }, title: "List the tools you already mention", why: `Your bullets mention ${shown.slice(0, 4).join(", ")} but your skills list doesn't. ATS often only scan the skills section.` });
    }
    if (hard.length < 6) {
      score -= 25;
      add("skills", { target: "K", priority: "must", fix: "ask", title: "Add more hard skills", why: "ATS filters match on specific tools and methods; 8-15 skills is a good range.", question: "Which tools, software or methods do you use regularly at work? List them and I'll add the ones your experience supports." });
    } else if (hard.length > 25) {
      score -= 10;
      add("skills", { target: "K", fix: "action", action: "Trim my skills list to the 15 most important hard skills for my experience; keep only skills I already listed.", title: "Trim your skills list", why: `${hard.length} skills dilutes the important ones – 10-15 focused skills read stronger.` });
    }
    if (!(r.certifications || []).length) {
      score -= 15;
      add("skills", { target: "Z", fix: "ask", title: "Add certifications, if you have any", why: "Certifications are keywords recruiters filter on (e.g. PMP, AWS, Google Analytics, Scrum).", question: "Do you have any certifications or courses with certificates? List them with the year, or skip if none." });
    }
    scores.skills = clamp(score);
  }

  // ---- Length & format ----
  {
    let score = 100;
    const years = getCandidateYears(r);
    const target = years != null && years >= 8 ? 2 : 1;
    if (pages != null && pages > target) {
      score -= 35;
      add("format", { target: null, priority: "must", fix: "action", action: `Make my resume fit on ${target} page${target > 1 ? "s" : ""}: tighten wording and drop the least important bullets from older roles.`, title: `Fit it on ${target} page${target > 1 ? "s" : ""}`, why: `It's ${pages} pages now. With ${years != null ? `about ${Math.round(years)} years` : "your"} experience, ${target} page${target > 1 ? "s" : ""} is the norm – recruiters skim, and extra pages bury your best work.` });
    }
    const styles = new Set((r.experience || []).map((e) => periodStyle(e.period)).filter(Boolean));
    if (styles.size > 1) {
      score -= 15;
      add("format", { target: null, fix: "action", action: "Make all my role dates use the same format, like Jan 2021 – Mar 2023. Don't change the dates themselves.", title: "Use one date format", why: "Mixed date styles look careless and can confuse ATS date parsing." });
    }
    if (!(r.education || []).length) {
      score -= 20;
      add("format", { target: null, fix: "ask", title: "Add your education", why: "Many ATS filters require a degree field; leaving it empty can drop you from searches.", question: "What's your highest degree, college and graduation year?" });
    }
    const bulletCount = (r.experience || []).flatMap((e) => e.bullets || []).filter(Boolean).length;
    if (bulletCount > 24) {
      score -= 10;
      add("format", { target: null, fix: "action", action: "Cut my resume to the 20 strongest bullets overall, keeping more for recent roles.", title: "Fewer, stronger bullets", why: `${bulletCount} bullets is a lot to skim; 3-5 per recent role is the sweet spot.` });
    }
    scores.format = clamp(score);
  }

  const categories = CATEGORIES.map((c) => ({ ...c, score: scores[c.id], issues: issues.filter((i) => i.category === c.id) }));
  const overall = clamp(categories.reduce((sum, c) => sum + c.score * c.weight, 0));
  return { overall, categories, issues };
}
