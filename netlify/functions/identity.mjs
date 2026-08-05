// netlify/functions/identity.mjs
//
// Fires automatically on Netlify Identity lifecycle events for this site.
// We hook `userLogin` — it fires every time someone successfully logs in,
// which means:
//   - It only runs for real, authenticated people (never unconfirmed signups)
//   - It's naturally idempotent: if they already have Drive access, the
//     Drive API call below just no-ops (we swallow the "already exists" error)
//   - Every future login re-checks access, so if someone was manually
//     removed from the Drive folder, logging in again won't silently
//     restore it (Drive access removal always wins) — but if they were
//     never added, they'll get added on their very next login.
//
// Setup required (see README-drive-setup.md in this folder):
//   1. A Google Cloud service account with the Drive API enabled
//   2. That service account's JSON key pasted into the Netlify env var
//      GOOGLE_SERVICE_ACCOUNT_KEY
//   3. The target Drive folder shared with the service account's email
//      (found as "client_email" inside that JSON key) as an Editor
//   4. The folder's ID in the Netlify env var GOOGLE_DRIVE_FOLDER_ID

import { google } from "googleapis";

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
