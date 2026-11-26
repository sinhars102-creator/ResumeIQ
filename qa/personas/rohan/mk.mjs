import { textToPdf } from "../harness.mjs";
const t = `ROHAN KAPOOR
Associate Director - Corporate Finance
Mumbai, India | rohan.kapoor.fin@example.com | +91 98200 00000 | linkedin.com/in/rohankapoor-fin-example

PROFILE
Finance professional with 10 years experience in FP&A, financial modelling and business partnering at large financial services organisations.

EXPERIENCE

Associate Director, Corporate Finance                          Apr-2018 – Present
Meridian Financial Services Ltd, Mumbai
* Own annual budget and rolling forecast for a business unit with revenue of INR 1,842.6 Cr
 - Led variance analysis and monthly P&L review with business heads
• Built the financial model supporting the acquisition of a wealth-management firm for INR 412.5 Cr (supported deal team; did diligence workstreams on financials)
* Presented quarterly performance to Board and senior management
 - Managed a team of 6 analysts
• Introduced capital allocation framework used for investment approvals above INR 25 Cr

Senior Manager, FP&A                                  Apr 2015 to Mar 2018
Crestline Capital Pvt Ltd, Mumbai
- Prepared annual operating plan, forecasting and budgeting for 4 business lines
* Automated MIS reporting in Excel and Power BI, reducing monthly close reporting time significantly
• Supported valuation of 3 investments (DCF and comparables)

Manager, Financial Planning                          2012 to 2015
Halden Securities Ltd, Pune
* Variance analysis and management reporting for broking division
- Worked on SAP month-end close and reconciliations

Finance Executive                                    June 2012 - 2015
Orbit Textiles India Pvt Ltd
* Accounts payable review, MIS and budgeting support

EDUCATION
MBA Finance - Narsee Monjee style Institute of Management, Mumbai  2010-2012
B.Com - University of Mumbai - 2010

SKILLS
FP&A, Budgeting, Forecasting, Variance analysis, Financial modelling, Valuation, Advanced Excel, PowerPoint, SAP, Power BI, M&A support
`;
await textToPdf(t, "/Users/rahulsinha/ResumeIQ/sidebar-event/qa/personas/rohan/old.pdf");
