// netlify/functions/identity.mjs
//
// Fires automatically on Netlify Identity lifecycle events for this site.
//
// Two handlers:
//
// 1. userValidate — fires BEFORE a new account is created. We check the
//    signup email against a list of approved emails (a Google Sheet
//    published to the web as plain CSV) and reject the signup outright
//    if it's not on the list. This is what lets us run Identity in "Open"
//    registration mode (free up to 1,000 users) instead of "Invite only"
//    (free for only 5 users) while still keeping randoms out.
//
//    To approve a new member: add their email as a new row in the
//    "Approved Members" Google Sheet. No redeploy needed — the function
//    fetches the live sheet on every signup attempt.
//
// 2. userLogin — fires every time someone successfully logs in. Grants
//    them Drive access automatically (see README-drive-setup.md).
//
// Setup required for the approved-email check:
//   1. Create a Google Sheet with one column of approved emails
//      (header row + one email per row below it).
//   2. File → Share → Publish to web → select the relevant sheet/tab →
//      format: CSV → Publish. Copy the resulting URL.
//   3. Add that URL as the Netlify env var APPROVED_EMAILS_CSV_URL.
//
// Setup required for the Drive auto-grant (see README-drive-setup.md):
//   1. A Google Cloud service account with the Drive API enabled
//   2. That service account's JSON key pasted into the Netlify env var
//      GOOGLE_SERVICE_ACCOUNT_KEY
//   3. The target Drive folder shared with the service account's email
//      (found as "client_email" inside that JSON key) as an Editor
//   4. The folder's ID in the Netlify env var GOOGLE_DRIVE_FOLDER_ID

import { google } from "googleapis";

async function isEmailApproved(email) {
  const csvUrl = process.env.APPROVED_EMAILS_CSV_URL;
  if (!csvUrl) {
    console.error("identity.mjs: missing APPROVED_EMAILS_CSV_URL env var — denying all signups by default.");
    return false;
  }
  if (!email) return false;

  try {
    const res = await fetch(csvUrl);
    const text = await res.text();

    // Simple CSV parse: one email per line, ignore header row, ignore blanks/quotes.
    const approved = text
      .split(/\r?\n/)
      .map(line => line.replace(/["']/g, "").trim().toLowerCase())
      .filter(line => line.includes("@")); // crude filter to skip header/blank rows

    return approved.includes(email.trim().toLowerCase());
  } catch (err) {
    console.error("identity.mjs: failed to fetch approved-emails CSV:", err.message);
    return false; // fail closed — if we can't check the list, don't let them in
  }
}

async function grantDriveAccess(email) {
  if (!email) return;

  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!rawKey || !folderId) {
    console.error(
      "identity.mjs: missing GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_DRIVE_FOLDER_ID env vars — skipping Drive grant."
    );
    return;
  }

  const credentials = JSON.parse(rawKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  try {
    await drive.permissions.create({
      fileId: folderId,
      sendNotificationEmail: false,
      requestBody: {
        type: "user",
        role: "reader", // change to "writer" if members should be able to edit/upload
        emailAddress: email,
      },
    });
    console.log(`Drive access granted to ${email}`);
  } catch (err) {
    // If they already have access, Google may return a 400/409-style error.
    // We don't want that to ever block someone's login, so just log it.
    console.error(`Drive grant for ${email} failed (likely already has access):`, err.message);
  }
}

export default {
  async userValidate(event) {
    const email = event?.user?.email;
    const approved = await isEmailApproved(email);
    if (!approved) {
      console.log(`Rejected signup attempt from non-approved email: ${email}`);
      return event.deny();
    }
    console.log(`Approved signup for ${email}`);
  },

  async userLogin(event) {
    const email = event?.user?.email;
    try {
      await grantDriveAccess(email);
    } catch (err) {
      // Never throw from here — a Drive/API hiccup must not block real logins.
      console.error("identity.mjs userLogin handler error:", err);
    }
  },
};
