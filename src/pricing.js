/**
 * What ResumeIQ charges, in one place: the home page, the payment step and the legal pages all read these.
 * The server keeps its own copy (server/entitlements.js) because the server sets the real amount; a test checks the two agree.
 */
export const PLANS = [
  { id: "dl1", title: "1 download", price: 79, note: "This resume, one PDF" },
  { id: "dl10", title: "10 downloads", price: 399, note: "30 days · about ₹40 each" },
  { id: "dlunlimited", title: "Unlimited", price: 799, note: "30 days · as many as you need" },
];

export const PRICE_FROM = Math.min(...PLANS.map((p) => p.price));

/** One line for the home page and ads: what is free and what costs money. */
export const PRICE_LINE = `Free to edit and preview. Downloading your PDF costs ₹${PLANS[0].price} for one, ₹${PLANS[1].price} for 10 (30 days) or ₹${PLANS[2].price} unlimited (30 days). One-time payments, no subscription.`;
