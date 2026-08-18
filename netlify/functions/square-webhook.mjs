// netlify/functions/square-webhook.mjs
//
// Receives Square's payment.updated webhook, verifies it's genuinely from
// Square (Apps Script can't do this — it has no access to HTTP headers,
// which is where Square's signature lives), then forwards a trusted,
// pre-authenticated request to the Apps Script backend to mark the
// matching team as paid.
//
// SETUP REQUIRED — Netlify environment variables:
//   SQUARE_WEBHOOK_SIGNATURE_KEY   — from the webhook subscription in
//                                    your Square Developer Dashboard
//   SQUARE_WEBHOOK_NOTIFICATION_URL — the EXACT URL registered with Square,
//                                    e.g. https://www.hot.hockey/.netlify/functions/square-webhook
//                                    (must match exactly — Square's signature
//                                    calculation includes this URL string)
//   APPS_SCRIPT_URL                — your existing Apps Script web app URL
//   WEBHOOK_SHARED_SECRET          — a random string you make up yourself,
//                                    shared between this function and the
//                                    Apps Script, so the Script can trust
//                                    that a request really came from here
//                                    and not from someone guessing the URL

import crypto from "node:crypto";

export default async (req) => {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  const appsScriptUrl = process.env.APPS_SCRIPT_URL;
  const sharedSecret = process.env.WEBHOOK_SHARED_SECRET;

  if (!signatureKey || !notificationUrl || !appsScriptUrl || !sharedSecret) {
    console.error("square-webhook: missing one or more required env vars.");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signatureHeader = req.headers.get("x-square-hmacsha256-signature");
  const rawBody = await req.text();

  // ---- Verify this really came from Square ----
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(notificationUrl + rawBody);
  const expectedSignature = hmac.digest("base64");

  if (!signatureHeader || expectedSignature !== signatureHeader) {
    console.error("square-webhook: signature mismatch — rejecting.");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("square-webhook: could not parse JSON body.");
    return new Response("Bad JSON", { status: 400 });
  }

  // We only care about payments reaching COMPLETED status.
  if (payload.type !== "payment.updated") {
    return new Response("Ignored (not a payment.updated event)", { status: 200 });
  }

  const payment = payload?.data?.object?.payment;
  if (!payment || payment.status !== "COMPLETED") {
    return new Response("Ignored (payment not completed)", { status: 200 });
  }

  const buyerEmail = payment.buyer_email_address || "";
  const note = payment.note || "";
  const amount = payment.amount_money ? payment.amount_money.amount / 100 : 0;
  const squarePaymentId = payment.id || "";

  // Forward to Apps Script — this is where the actual Sheet gets updated.
  // The team name embedded in `note` (set when the link was created) is
  // now the primary way payments get matched to teams — reliable
  // regardless of who actually clicks pay. Email is kept as a fallback
  // only, for payments made through the old generic static link.
  try {
    const params = new URLSearchParams();
    params.append("action", "recordSquarePayment");
    params.append("secret", sharedSecret);
    params.append("note", note);
    params.append("email", buyerEmail);
    params.append("amount", amount);
    params.append("squarePaymentId", squarePaymentId);

    await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    console.error("square-webhook: failed to notify Apps Script:", err);
    // Still return 200 to Square — we don't want it endlessly retrying a
    // webhook that it successfully delivered. This failure gets logged
    // here in Netlify's function logs for manual follow-up instead.
  }

  return new Response("OK", { status: 200 });
};
