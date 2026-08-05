# Auto-Granting Drive Access on Login, and Gating Signup by Approved Email

This connects Netlify Identity to your Google Drive folder so that the moment
someone logs into the site, they're automatically added to the shared
document folder — and it lets you run Identity in **Open** registration mode
(free for up to 1,000 users) instead of **Invite only** (free for only 5)
while still keeping signup limited to people you've actually approved.

You only need to do this once. Budget about 30–40 minutes.

---

## Part A: The approved-email allowlist (do this first)

This is what lets you safely use Open registration.

1. Create a new Google Sheet (or a new tab in an existing one). Put a header
   in cell A1 like `Email`, then list one approved email per row below it.
2. **File → Share → Publish to web**.
3. Under "Link", choose the specific sheet/tab with your email list (not
   "Entire Document" if you have other tabs you don't want public).
4. Under format, choose **Comma-separated values (.csv)**.
5. Click **Publish**, confirm, and copy the URL it gives you.
   - Note: this makes that sheet's contents readable by anyone with the
     link — but it's just a list of approved emails, not sensitive
     documents, so that's an acceptable tradeoff.
6. In Netlify: **Site configuration → Environment variables → Add a variable**
   - **Key:** `APPROVED_EMAILS_CSV_URL`
   - **Value:** the published URL from step 5
7. In Netlify: **Site configuration → Identity → Registration** → set to
   **Open**.

To approve a new member going forward: **add their email as a new row in
the Sheet.** That's it — nothing to redeploy, nothing else to configure.
To revoke someone's ability to sign up in the future: delete their row.
(This doesn't affect people who already have an account — see "Removing
someone's access" below.)

---

## Part B: Auto-granting Drive access on login

## 1. Create a Google Cloud service account

A "service account" is a robot Google account your website can use to make
Drive changes on your behalf. It's free.

1. Go to https://console.cloud.google.com/
2. Create a new project (top-left project dropdown → "New Project"). Name it
   something like `hot-website`.
3. In the search bar, search for **"Google Drive API"** and click **Enable**.
4. In the left sidebar: **IAM & Admin → Service Accounts → Create Service Account**.
   - Name it something like `hot-drive-bot`.
   - You can skip the optional role-granting and "grant users access" steps —
     click through to **Done**.
5. Click on the service account you just created → **Keys** tab → **Add Key**
   → **Create new key** → choose **JSON** → Create.
   - This downloads a `.json` file to your computer. **Keep this safe** — it's
     effectively a password. Don't commit it to GitHub.
6. Open that JSON file in a text editor. You'll need its entire contents in
   step 3 below, and you'll need the `client_email` value (looks like
   `hot-drive-bot@hot-website-123456.iam.gserviceaccount.com`) in step 2.

## 2. Share your Drive folder with the service account

1. Open your Google Drive folder (the one members should get access to).
2. Click **Share**.
3. Paste in the service account's `client_email` from the JSON file.
4. Set its role to **Editor**.
5. Uncheck "Notify people" (it's a robot, no need to email it) and click **Share**.

This lets the service account grant *other* people access to the folder —
it can't do that unless it has edit rights itself.

## 3. Add the two environment variables in Netlify

1. In your Netlify dashboard: **Site configuration → Environment variables → Add a variable**.
2. Add:
   - **Key:** `GOOGLE_SERVICE_ACCOUNT_KEY`
     **Value:** paste the *entire contents* of the JSON file from step 1
     (all of it, including the `{ }` braces).
   - **Key:** `GOOGLE_DRIVE_FOLDER_ID`
     **Value:** the ID from your folder's URL. For a URL like
     `https://drive.google.com/drive/folders/1Kr4dgKrWw7Em9dbFcE-MUWRVwXruY-xU?usp=sharing`,
     the folder ID is the part between `/folders/` and `?`:
     `1Kr4dgKrWw7Em9dbFcE-MUWRVwXruY-xU`
3. Save, then trigger a new deploy (Netlify needs to redeploy for new env
   vars to reach your functions).

## 4. Test it

1. Add a test email to your Approved Members Sheet (Part A).
2. Try signing up with that exact email on `login.html`.
3. Log in.
4. Check the Drive folder's Share dialog — your test email should now
   appear in the list within a few seconds.
5. Try signing up with a *different*, non-approved email — it should be
   rejected during signup.
6. Check **Netlify → Functions → identity → Logs** if anything doesn't
   behave as expected — the function logs exactly what happened (missing
   env vars, rejected signups, Drive API errors, etc.).

---

### Changing what access members get

In `netlify/functions/identity.mjs`, the line

```js
role: "reader",
```

controls what members can do in the folder. Change `"reader"` to `"writer"`
if members should be able to upload/edit documents themselves, not just view.

### Removing someone's access

This system only ever *adds* Drive access — it never removes it, and the
approved-email check only ever blocks *new* signups. To fully revoke
someone who already has an account:
1. Remove them from the Drive folder's Share dialog directly.
2. Delete/block their account in **Netlify → Identity → Users**.
3. Remove their row from the Approved Members Sheet (prevents them from
   signing up again if they were ever deleted and tried to re-register).

All three matter — each system is independent of the other.

