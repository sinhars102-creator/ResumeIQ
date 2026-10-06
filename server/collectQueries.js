/**
 * Searches the collector runs on Adzuna, which has no "list every role" API. LinkedIn
 * doesn't use this list: it is demand-driven, collecting the searches users ask for
 * (public.search_demand). Career boards need no queries – they are pulled in full.
 *
 * Cost: each LinkedIn search is one Apify run of up to LINKEDIN_PER_QUERY roles (~$0.04 per 100).
 */
export const COLLECT_LOCATION = "India";
export const LINKEDIN_PER_QUERY = 100;
export const ADZUNA_PER_QUERY = 100;

export const COLLECT_QUERIES = [
  // Product
  "Product Manager",
  "Senior Product Manager",
  "Associate Product Manager",
  "Group Product Manager",
  "Director of Product",
  "Head of Product",
  "Product Owner",
  // Engineering & data
  "Software Engineer",
  "Senior Software Engineer",
  "Engineering Manager",
  "Data Scientist",
  "Data Analyst",
  "Data Engineer",
  // Design
  "Product Designer",
  "UX Designer",
  // Business
  "Business Analyst",
  "Program Manager",
  "Project Manager",
  "Marketing Manager",
  "Growth Manager",
  "Sales Manager",
  "Account Manager",
  "Customer Success Manager",
  "Operations Manager",
  "HR Business Partner",
  "Finance Manager",
];
