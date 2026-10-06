/**
 * Curated India employers to look for career boards for, on top of the companies found
 * in collected postings. Names only: discovery (server/companyDiscovery.js) works out
 * whether each has a Greenhouse / Lever / Ashby / Workable board. Companies on other
 * systems (Workday, Darwinbox, their own sites) are recorded as 'no_board'.
 * Add names freely; `npm run collect -- --sources=discover` checks new ones.
 */
export default [
  // Consumer internet & commerce
  "Flipkart", "Myntra", "Meesho", "Swiggy", "Zomato", "Zepto", "Blinkit", "BigBasket", "Nykaa", "Lenskart",
  "FirstCry", "Urban Company", "Dunzo", "Ola", "Rapido", "MakeMyTrip", "Cleartrip", "ixigo", "OYO", "Licious",
  "boAt", "Mamaearth", "Purplle", "Pepperfry", "Tata 1mg", "PharmEasy", "Practo", "Cars24", "Spinny", "CarDekho",
  "Delhivery", "Shiprocket", "Porter", "BlackBuck", "Udaan", "Jumbotail", "DealShare", "Country Delight",
  // Fintech
  "Razorpay", "PhonePe", "Paytm", "CRED", "Groww", "Zerodha", "Upstox", "PolicyBazaar", "Pine Labs", "BharatPe",
  "MobiKwik", "Jupiter", "Fi Money", "Slice", "Navi", "KreditBee", "Lendingkart", "Juspay", "Cashfree Payments",
  "Perfios", "M2P Fintech", "Zeta", "Open Financial Technologies", "Acko", "Digit Insurance", "InsuranceDekho",
  "Smallcase", "INDmoney", "Scripbox", "OneCard", "Paisabazaar", "Rupeek", "Khatabook", "OkCredit", "Jar",
  // SaaS & enterprise software
  "Freshworks", "Zoho", "Postman", "BrowserStack", "Chargebee", "Druva", "Icertis", "Darwinbox", "Whatfix",
  "MoEngage", "CleverTap", "WebEngage", "LeadSquared", "Hasura", "Innovaccer", "Highradius", "Sprinklr",
  "Mindtickle", "Atlan", "Rocketlane", "Zluri", "Spyne", "Gupshup", "Exotel", "Yellow.ai", "Haptik", "Uniphore",
  "Observe.AI", "Sarvam", "Krutrim", "Fractal Analytics", "MathCo", "Tiger Analytics", "Mu Sigma", "Tredence",
  "Capillary Technologies", "Unicommerce", "Increff", "Signzy", "IDfy", "Setu", "Plum", "Leap Finance", "Hevo Data",
  // Edtech & media
  "Unacademy", "upGrad", "PhysicsWallah", "Scaler", "Vedantu", "Eruditus", "Simplilearn", "Classplus",
  "ShareChat", "Dailyhunt", "Pocket FM", "Kuku FM", "JioCinema", "Dream11", "MPL", "Games24x7", "Nazara",
  // Global tech with large India teams
  "Google", "Microsoft", "Amazon", "Adobe", "Salesforce", "Atlassian", "Uber", "LinkedIn", "Intuit", "Walmart Global Tech",
  "Target", "PayPal", "Visa", "Mastercard", "American Express", "Goldman Sachs", "JPMorgan Chase", "Morgan Stanley",
  "Oracle", "SAP", "Cisco", "Qualcomm", "NVIDIA", "Intel", "Samsung", "Airbnb", "Expedia", "Booking.com", "Agoda",
  "Rubrik", "Nutanix", "VMware", "ServiceNow", "Workday", "Databricks", "Snowflake", "MongoDB", "Okta", "Twilio",
  "Stripe", "Coinbase", "Grammarly", "Canva", "Notion", "Figma", "Zendesk", "HubSpot", "DoorDash", "Instacart",
  // IT services & consulting
  "Tata Consultancy Services", "Infosys", "Wipro", "HCLTech", "Tech Mahindra", "LTIMindtree", "Persistent Systems",
  "Coforge", "Mphasis", "Zensar", "Accenture", "Deloitte", "EY", "KPMG", "PwC", "McKinsey & Company",
  "Boston Consulting Group", "Bain & Company", "ZS Associates", "Capco", "Thoughtworks", "Publicis Sapient",
  // Conglomerates, banks & others
  "Reliance Jio", "Tata Digital", "Airtel", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank",
  "Bajaj Finserv", "Aditya Birla Group", "Mahindra Group", "Godrej", "Hindustan Unilever", "ITC", "Asian Paints",
  "Ather Energy", "Ola Electric", "Tata Motors", "Maruti Suzuki", "InMobi", "Truecaller", "PayPay India",
];
