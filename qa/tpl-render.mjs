import fs from "node:fs";
import { buildResumePdf } from "../src/resumePdf.js";
import { TEMPLATES, templateFormat } from "../src/resumeTemplates.js";
import { finalResume } from "../src/tailorEdits.js";
const resume = {
  name: "Dr. Venkata Subramanyam Ramachandran Narayanaswamy Iyer",
  title: "Lead Product Manager | AI-Led Omni-channel Marketplace Products | First-Principles Problem Solving | Experimentation & Data-Driven Growth | Platform Strategy",
  contact: "sinha.rs102@gmail.com · +91-9886977808 · Bangalore, Karnataka · https://www.linkedin.com/in/rahul-sinha-product-manager-bangalore-marketplace-growth-0123456789abcdef",
  summary: "Customer-first product leader with 9+ years of experience building and scaling 0→1 and growth-stage marketplace products across B2C and B2B commerce, with deep experience in seller ranking, pricing optimization, inventory matching, and buy-box logic.",
  experience: [
    { role: "Lead Product Manager - AI-Led Omni-channel Marketplace Optimization and Seller Experience", company: "TATA Digital - BigBasket | TATA CliQ | Tata Neu Super App Group", period: "Aug 2021 to Sept 2022", bullets: ["Led AI-driven marketplace optimization, owning buy-box logic, seller ranking, and fulfillment reliability systems across three regions with engineering, design, and operations teams", "Reduced cancellations (35%) by redesigning buy-box algorithm (price vs reliability trade-off) using multi-factor scoring -> Improved repeat purchases by 32%"] },
    { role: "Manager - Supply Chain Products", company: "Blinkit (formerly Grofers)", period: "Dec 2015 to Dec 2018", bullets: ["Built supply-side systems for a high-scale grocery marketplace", "Improved availability (60% -> 89%)"] },
  ],
  education: [
    { degree: "Masters In Business Administration (Full Time Programme in General Management)", school: "Indian Institute of Management Ahmedabad", year: "2023", grade: "CGPA 3.4/4.0 (top quartile of the batch)", details: ["General Management, Strategy and Operations; Dean's list in two terms"] },
    { degree: "B. Tech", school: "Manipal Institute of Technology", year: "2016" },
  ],
  skills: ["Product Strategy & Roadmapping", "Scalable System Design & Decisioning", "0→1 Product Development & PMF", "ML Recommendation Systems", "Predictive Modeling & Forecasting"],
  certifications: ["Certified Scrum Product Owner (CSPO) from the Scrum Alliance, 2022", "Google Analytics"],
  languages: ["English", "Hindi", "Kannada"], interests: ["Chess", "Running"],
  projects: [{ name: "Demand forecasting and replenishment platform for perishables at national scale", period: "2021 to 2022", bullets: ["Forecast demand for perishables across 400 dark stores"] }],
  volunteer: [{ role: "Product mentor", organization: "ADPList (a global mentorship platform for designers and PMs)", period: "2020 to Present", bullets: ["Mentored 40 product managers"] }],
  achievements: ["Top performer, 2019 and 2021, out of a product organisation of more than two hundred people"],
  otherSections: [{ title: "Core Competencies", items: ["Product & System Leadership – Expert", "Data & AI Systems – Expert"] }],
};
for (const t of TEMPLATES) {
  const doc = buildResumePdf(finalResume(resume), null, templateFormat(t.id));
  fs.writeFileSync(`qa/tpl/${t.id}.pdf`, Buffer.from(doc.output("arraybuffer")));
  console.log(t.id, doc.getNumberOfPages(), "pages");
}
