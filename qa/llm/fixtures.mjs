// Hostile, realistic fixtures (7b rule 2). Characters are written as escapes so the file is reviewable:
// U+2010 U+2011 U+2013 U+2212 hyphens/dashes, U+00A0 NBSP, smart quotes, 0→1, →, &, | separators.
const H2010 = "‐", H2011 = "‑", EN = "–", MINUS = "−", NB = " ";
export const HOSTILE = {
  name: "Ananya Iyer",
  title: `Senior Product Manager ${EN} Payments, Lending & Marketplaces | 0→1 and scale | B2B${H2011}B2C`,
  contact: `ananya.iyer@example.com | +91${NB}90000${NB}00101 | Bengaluru | linkedin.com/in/ananya${H2011}iyer`,
  summary: `Product leader with 8+ years building high${H2011}scale payments and supply${H2011}side marketplace products. Took 3 products from 0→1, owned the “merchant growth” roadmap and partnered with engineering, risk & compliance. I’m known for data${H2010}driven decisions.`,
  experience: [
    { company: "PayNest", role: "Senior Product Manager", period: `Jan 2021 ${EN} Present`, bullets: [
      `Owned supply${H2011}side growth for a high${H2011}scale merchant marketplace, taking GMV from ₹120 Cr to ₹310 Cr in 18 months`,
      `Launched UPI AutoPay (0→1) for 40K+ merchants; cut failed mandates by 31% & support tickets by 22%`,
      `Led a squad of 9 engineers, 2 designers & 1 analyst across Bengaluru | Pune`,
      `Built the merchant onboarding funnel (KYC → activation), lifting activation from 38% to 61%`,
      `Defined the pricing${H2010}experiment framework; ran 14 A/B tests, 6 shipped, +4.2% take${MINUS}rate`,
      `Worked with risk and compliance on RBI guidelines`,
      `Helped with quarterly planning and stakeholder updates`,
      `Managed vendor relationships and contracts`,
    ] },
    { company: "LendKart", role: "Product Manager", period: `Jun 2018 ${EN} Dec 2020`, bullets: [
      `Shipped the instant${H2011}loan journey (0→1) disbursing ₹450 Cr across 1.2M customers`,
      `Reduced loan TAT from 48 hrs to 9 mins by automating underwriting with the data science team`,
      `Grew repeat${H2011}borrower rate from 22% to 41% through credit${MINUS}line upgrades`,
      `Partnered with 12 NBFCs & banks on co${H2010}lending; negotiated revenue share`,
      `Wrote PRDs, ran sprint ceremonies and managed the backlog`,
      `Assisted the CPO in preparing board decks`,
      `Responsible for customer interviews and usability tests`,
    ] },
    { company: "ShopWave", role: "Associate Product Manager", period: `Jul 2016 ${EN} May 2018`, bullets: [
      `Improved checkout conversion by 9% via address${H2011}autofill and one${H2011}tap payments`,
      `Built a seller dashboard used by 8,000+ sellers (weekly active use 63%)`,
      `Analysed funnel drop${H2010}offs in SQL & Mixpanel; presented findings to leadership`,
      `Supported the launch of the seller app on Android`,
      `Handled day to day tasks for the catalog team`,
    ] },
    { company: "Infosys", role: "Systems Engineer", period: `Jul 2014 ${EN} Jun 2016`, bullets: [
      `Developed Java modules for a retail banking client; 99.9% uptime`,
      `Automated regression tests, saving ~30 hrs per release`,
      `Worked on bug fixes and support tickets`,
    ] },
  ],
  education: [
    { degree: "MBA", school: "IIM Bangalore", year: "2016", grade: "CGPA 8.4/10" },
    { degree: "B.Tech (Computer Science)", school: "NIT Trichy", year: "2014", grade: "CGPA 8.9/10" },
  ],
  skills: ["Product Strategy", "Roadmapping", "Payments", "UPI", "Lending", "Marketplaces", "Experimentation", "A/B Testing", "SQL", "Mixpanel", "Amplitude", "Tableau", "Jira", "Figma", "Stakeholder Management", "Go-to-Market", "Pricing", "Unit Economics", "KYC", "Risk & Compliance", "Agile", "OKRs", "Java", "Python"],
  certifications: ["Certified Scrum Product Owner (CSPO)", "Google Data Analytics Certificate"],
  projects: [
    { name: `PayNest Merchant Console (0→1)`, period: "2022", bullets: [`Built the self${H2011}serve console with the design team`, `Cut merchant support load by 22%`] },
    { name: "Open-source UPI mock server", period: "2020", bullets: [`Maintained a Go library used by 300+ developers`] },
  ],
  volunteer: [{ role: "Mentor", organization: "Women in Product India", period: "2019 – Present", bullets: [`Mentored 12 first${H2011}time product managers`] }],
  achievements: [`Winner, PayNest Product Excellence Award 2022`, `Top 1% in CAT 2014`, `Speaker at ProductCon India 2023`, `Rated "Outstanding" in 3 consecutive annual reviews`],
  publications: [`“Designing UPI AutoPay for 40K merchants”, Medium, 2023`, `Co${H2010}author, “Marketplace liquidity in India”, ProductCon whitepaper, 2022`],
  languages: ["English", "Hindi", "Tamil"],
  interests: ["Chess", "Trekking", "Classical music"],
  references: [{ name: "Rahul Menon", title: "VP Product, PayNest" }, { name: "Divya Rao", title: "CPO, LendKart" }],
  otherSections: [
    { title: "Core Competencies", items: [
      `Product Strategy & Vision`, `Payments & Lending Products`, `Marketplace Growth (supply${H2011}side & demand${H2011}side)`, `0→1 Product Launches`, `Data${H2010}Driven Decision Making`, `Stakeholder & Executive Communication`, `Cross${H2010}functional Leadership`, `Risk, Compliance & Regulatory Alignment`, `Experimentation & Pricing`, `Roadmap Prioritisation`, `Customer Discovery & Research`, `Go${H2010}to${H2010}Market Strategy`, `Vendor & Partner Management`, `Agile & Scrum`, `OKR Planning`, `Team Mentoring`,
    ] },
    { title: "Positions of Responsibility", items: [`Class representative, MBA 2016`, `Convenor, IIMB Product Club`, `Cultural secretary, NIT Trichy 2013`] },
  ],
};
export const JD_PM = `Senior Product Manager, Marketplace Growth – Razorpay-like fintech, Bengaluru

About the role
We are looking for a Senior Product Manager to own supply${H2011}side growth for our high${H2011}scale merchant marketplace. You will define the roadmap, run pricing experiments and partner with engineering, design, risk and compliance.

What you will do
- Own the supply-side growth roadmap for a high-scale marketplace used by lakhs of merchants
- Run A/B tests and pricing experiments; use SQL and product analytics to make data-driven decisions
- Launch new payment and lending products from 0 to 1
- Work with stakeholders across engineering, design, risk and compliance
- Mentor associate product managers

What we look for
- 6+ years of product management experience, ideally in payments, lending or marketplaces
- Strong stakeholder management and communication
- Experience with UPI, KYC and regulatory requirements
- Hands-on with SQL, Mixpanel or Amplitude
- MBA or B.Tech preferred`;
export const JD_HINGLISH = `Hum ek Senior Product Manager dhoondh rahe hain jo hamare payments marketplace ko scale kare. Aapko merchants ke saath kaam karna hoga, roadmap banana hoga aur engineering aur design teams ke saath milkar naye features launch karne honge. SQL aur data analytics ka acha knowledge hona chahiye. Aapko A/B testing aur pricing experiments ka experience hona chahiye. 5+ saal ka product management experience zaroori hai, fintech ya marketplace background ho to bahut accha. Stakeholders ke saath communication strong honi chahiye aur aap team ko mentor kar sakein.`;
