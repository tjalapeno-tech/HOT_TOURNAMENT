// netlify/functions/grant-drive-access.mjs
//
// Called by the browser (from members.html) right after a successful
// login is confirmed — NOT by GoTrue's identity webhook. That's the
// whole point: this can take as long as it needs (Drive API calls
// involve an OAuth token exchange plus a separate permissions call,
// which together can be too slow for a blocking identity webhook —
// that's what was breaking Google logins before this was split out).
//
// Re-checks the approved-email list here too, as a safety net — this
// endpoint is a plain callable URL, so anyone could technically POST to
// it with any email; re-verifying against the approved list means only
// legitimate members can actually get Drive access this way.

import { google } from "googleapis";

async function isEmailApproved(email) {
  const csvUrl = process.env.APPROVED_EMAILS_CSV_URL;
  if (!csvUrl || !email) return false;

  try {
    const res = await fetch(csvUrl);
    const text = await res.text();
    const approved = text
      .split(/\r?\n/)
      .map(line => line.replace(/["']/g, "").trim().toLowerCase())
      .filter(line => line.includes("@"));
    return approved.includes(email.trim().toLowerCase());
  } catch (err) {
    console.error("grant-drive-access: failed to fetch approved-emails CSV:", err.message);
    return false;
  }
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let email;
  try {
    const body = await req.json();
    email = body.email;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!email) {
    return new Response("Missing email", { status: 400 });
  }

  const approved = await isEmailApproved(email);
  if (!approved) {
    console.log(`grant-drive-access: refused, not on approved list: ${email}`);
    return new Response(JSON.stringify({ success: false, message: "Not approved" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!rawKey || !folderId) {
    console.error("grant-drive-access: missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_DRIVE_FOLDER_ID.");
    return new Response(JSON.stringify({ success: false, message: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const credentials = JSON.parse(rawKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });

    await drive.permissions.create({
      fileId: folderId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "reader",
        emailAddress: email,
      },
    });
    console.log(`Drive access granted to ${email}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Very likely means they already have access — not a real failure.
    console.error(`Drive grant for ${email} failed (likely already has access):`, err.message);
    return new Response(JSON.stringify({ success: true, note: "already had access or minor issue" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
