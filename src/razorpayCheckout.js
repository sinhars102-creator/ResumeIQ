// Razorpay Standard Checkout: create the order on our server, open Razorpay's payment modal,
// then have the server verify the payment's signature. Only the key id is used here; the
// secret stays on the server (server/payments.js).

const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loading = null;
/** Razorpay's checkout script, loaded the first time someone pays. */
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment window – check your connection and try again"));
    };
    document.body.appendChild(s);
  });
  return loading;
}

async function post(path, body) {
  const r = await fetch(`${API_BASE.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `The request failed (${r.status})`);
  return data;
}

/**
 * Pay for a plan ("pack" | "pass"). Resolves { status: "paid", paymentId, orderId } once the server
 * has verified the payment, or { status: "cancelled" } if the modal is closed; rejects with a
 * message to show when the payment fails or can't be verified.
 */
export async function payForPlan(plan, { email, contact } = {}) {
  const [order] = await Promise.all([post("/api/create-order", { plan, email }), loadCheckout()]);
  return new Promise((resolve, reject) => {
    let settled = false;
    const rzp = new window.Razorpay({
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: "ResumeIQ",
      description: order.name,
      prefill: { email: email || "", contact: contact || "" },
      theme: { color: "#3F7D6E" },
      handler: async (response) => {
        settled = true;
        try {
          const v = await post("/api/verify-payment", response);
          resolve({ status: "paid", paymentId: v.payment_id, orderId: v.order_id });
        } catch (err) {
          reject(new Error(`We couldn't confirm your payment (${err.message}). If money was taken, write to rahul@myresumeiq.io with payment ID ${response.razorpay_payment_id}.`));
        }
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          if (failure) reject(new Error(failure));
          else resolve({ status: "cancelled" });
        },
      },
    });
    // A failed attempt keeps the modal open for another try; it's reported only if they then close it.
    let failure = "";
    rzp.on("payment.failed", (response) => {
      failure = `${response?.error?.description || "The payment failed"} – no money was taken. Please try again.`;
    });
    rzp.open();
  });
}
