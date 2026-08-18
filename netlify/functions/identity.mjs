// netlify/functions/identity.mjs
//
// Two handlers:
//
// 1. userValidate — approved-email check at signup time.
// 2. userLogin — approved-email check again at every login (covers
//    Google logins reliably, per testing). Deliberately fast — see
//    the comment on userLogin below for why.
//
// Drive access is granted by a SEPARATE function (grant-drive-access.mjs),
// called by the browser after login succeeds — not from here.

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

export default {
  // Gate #1: fires on new account creation (signup). Confirmed reliable
  // for plain email/password signups. Uncertain whether this fires
  // identically for external-provider (Google) signups — some
  // inconsistencies have been reported historically — so we don't rely
  // on this alone. See Gate #2 below.
  async userValidate(event) {
    const email = event?.user?.email;
    const approved = await isEmailApproved(email);
    if (!approved) {
      console.log(`Rejected signup attempt from non-approved email: ${email}`);
      return event.deny();
    }
    console.log(`Approved signup for ${email}`);
  },

  // Gate #2: fires on every successful login, confirmed reliable for
  // BOTH email/password and Google logins. Re-checking the approved
  // list here closes the gap in case Gate #1 doesn't apply uniformly
  // to every login method.
  //
  // IMPORTANT: this must stay FAST. Identity trigger webhooks like this
  // one are on a strict clock — GoTrue is waiting synchronously for a
  // response before it'll issue a session to the browser. Doing slow
  // work here (like calling Google's Drive API, which itself needs an
  // OAuth token exchange plus a separate API call) can push past that
  // limit and cause GoTrue to report "Failed to handle signup webhook,"
  // which silently kills the whole login — even though our code never
  // threw an error. The Drive grant now happens in a separate function
  // (grant-drive-access.mjs), called by the browser AFTER login
  // succeeds, with no timeout pressure at all.
  async userLogin(event) {
    const email = event?.user?.email;

    const approved = await isEmailApproved(email);
    if (!approved) {
      console.log(`Denied login for non-approved email: ${email}`);
      return event.deny();
    }
    // That's it — no Drive call here anymore. See grant-drive-access.mjs.
  },
};
