/**
 * Companies whose public career boards ResumeIQ searches.
 *   ats:  greenhouse | lever | ashby | workable
 *   slug: the board name in its URL - jobs.lever.co/<slug>, boards.greenhouse.io/<slug>,
 *         jobs.ashbyhq.com/<slug>, apply.workable.com/<slug>
 *
 * Seeded 2026-10-06 from board URLs seen in search results; spot-checked CRED, Meesho, Paytm,
 * Fam, InMobi, Truecaller, PayPay India, Atlan, Sarvam, Wisdom AI and Elevation Capital (all live). Run `npm run check-sources`
 * to confirm each board responds; set enabled: false on any that fail. Add companies
 * freely - India searches only show roles located in India (or remote).
 */
export default [
  { name: "CRED", ats: "lever", slug: "cred" },
  { name: "Meesho", ats: "lever", slug: "meesho" },
  { name: "Paytm", ats: "lever", slug: "paytm" },
  { name: "Paytm Payments Services", ats: "lever", slug: "paytmpayments" },
  { name: "Fam", ats: "lever", slug: "fampay" },
  { name: "Mindtickle", ats: "lever", slug: "mindtickle" },
  { name: "Hevo Data", ats: "lever", slug: "hevodata" },
  { name: "Acceldata", ats: "lever", slug: "acceldata" },
  { name: "Saviynt", ats: "lever", slug: "saviynt" },
  { name: "Neuron7", ats: "lever", slug: "neuron7" },
  { name: "Entrata", ats: "lever", slug: "entrata" },
  { name: "Dun & Bradstreet", ats: "lever", slug: "dnb" },
  { name: "AHEAD", ats: "lever", slug: "thinkahead" },
  { name: "Postman", ats: "greenhouse", slug: "postman", enabled: false }, // board returned 404 on 2026-10-06
  { name: "InMobi", ats: "greenhouse", slug: "inmobi" },
  { name: "Truecaller", ats: "greenhouse", slug: "truecaller" },
  { name: "PayPay India", ats: "greenhouse", slug: "pay2dc" },
  { name: "Agoda", ats: "greenhouse", slug: "agoda" },
  { name: "Twilio", ats: "greenhouse", slug: "twilio" },
  { name: "Capco", ats: "greenhouse", slug: "capco" },
  { name: "Flexport", ats: "greenhouse", slug: "flexport" },
  { name: "Anthropic", ats: "greenhouse", slug: "anthropic" },
  { name: "Atlan", ats: "ashby", slug: "atlan" },
  { name: "Sarvam", ats: "ashby", slug: "sarvam" },
  { name: "Wisdom AI", ats: "ashby", slug: "Wisdom-AI" },
  { name: "Collinear AI", ats: "ashby", slug: "collinear-ai" },
  { name: "AiPrise", ats: "ashby", slug: "aiprise" },
  { name: "Josys", ats: "ashby", slug: "josys" },
  { name: "Handshake", ats: "ashby", slug: "handshake" },
  { name: "Elevation Capital (portfolio roles)", ats: "workable", slug: "elevation-capital-3" },
];
