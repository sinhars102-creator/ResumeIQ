# Sample resumes for end-to-end testing

Ten fictional candidates – people, companies, emails and phone numbers are all made up (emails use
example.com, phones +91 90000 001xx). Each one varies something resume readers trip over.

| # | File | Candidate | Level | Format / layout | What it tests | Jobs to try |
|---|---|---|---|---|---|---|
| 1 | 01_Ananya_Iyer_Senior_PM.pdf | Senior PM – payments & lending | 8 yrs | PDF, classic one column | ₹ amounts ("₹1,200 Cr"), 3 roles, MBA + B.Tech | Senior PM fintech, Bengaluru |
| 2 | 02_Rohan_Mehta_Backend_Engineer.pdf | Backend engineer – Java / Kafka | 5 yrs | PDF, **two columns** (dark sidebar) | Skills/education in a sidebar, certifications | Senior Backend / Java engineer, Pune |
| 3 | 03_Priya_Nair_Data_Scientist.pdf | Data scientist – NLP, recsys | 4 yrs | PDF, modern, skill tags | "Profile" instead of "Summary", projects & publications, education last | Data Scientist, Hyderabad |
| 4 | 04_Karthik_Reddy_DevOps_SRE.docx | SRE / DevOps lead | 7 yrs | **Word**, dates as **"04/2022 - Present"** | .docx upload, numeric dates | SRE / DevOps lead, Chennai |
| 5 | 05_Sneha_Kulkarni_Product_Designer.pdf | Senior product designer | 6 yrs | PDF, two columns | Portfolio site instead of LinkedIn, non-engineering skills | Senior Product Designer, Mumbai |
| 6 | 06_Arjun_Singh_Enterprise_Sales.docx | Enterprise AE – B2B SaaS | 9 yrs | **Word** | Sales metrics (quota %, ₹ Cr ARR), non-tech role | Enterprise Account Executive, Gurugram |
| 7 | 07_Meera_Joshi_Finance_FPandA.pdf | CA – FP&A manager | 5 yrs | PDF, classic | Professional qualification (CA) as education, finance terms | FP&A Manager, Ahmedabad / Mumbai |
| 8 | 08_Vikram_Das_Digital_Marketing.pdf | Growth marketing manager | 6 yrs (career switch) | PDF, modern | Career switch (journalist → marketing), "open to remote" | Growth / Performance Marketing Manager |
| 9 | 09_Fatima_Sheikh_Talent_Acquisition.docx | Talent acquisition lead | 10 yrs | **Word**, **years only ("2022 – Present")** | "Professional Experience" / "Core Competencies" headings, no months | Talent Acquisition Lead, Noida / Delhi NCR |
| 10 | 10_Aditya_Verma_Fresher_CSE.pdf | Fresher – B.Tech CSE 2026 | 0 yrs (internships) | PDF, modern | **No full-time jobs** – "Internships" section, CGPA, Class XII, projects | Graduate / Software Engineer I, entry level |

## Suggested end-to-end pass per resume
1. **Upload** on the site → check parsing (name, roles, dates, skills; no "Day - 7"-style spacing).
2. **Job Matches** → do the roles and scores make sense for this person?
3. **Tailor** a strong and a weak match → wording fixes, must-have gaps, nothing invented.
4. **Preview / editor** → edit, then use the resume for applying.
5. **Extension** on a real posting → match %, Generate / Improve resume, Autofill (resume attached, employment
   history filled, dates right – especially #4 numeric dates, #9 years only, #10 internships).

Regenerate: the generator lives outside the repo; ask Claude to rebuild if you want changes.
