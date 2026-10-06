/**
 * Searches the collector runs on search-based sources (LinkedIn, Adzuna), which have
 * no "list every role" API. Every result is stored, so this list decides coverage:
 * add a role family here to start collecting it. Career boards need no queries –
 * they are pulled in full.
 *
 * Cost: each LinkedIn query is one Apify run of up to LINKEDIN_PER_QUERY roles.
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
