# Auto-Granting Drive Access on Login — One-Time Setup

This connects Netlify Identity to your Google Drive folder so that the moment
someone logs into the site, they're automatically added to the shared
document folder. No manual "add this email to Drive" step, ever again.

You only need to do this once. Budget about 20–30 minutes.

---

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

## 4. Set Identity to invite-only

Since this site is public, you don't want strangers signing themselves up
and getting instant Drive access.

1. **Site configuration → Identity → Registration**.
2. Set registration to **Invite only**.
3. To add a new member: **Identity → Users → Invite users**, enter their
   email. They'll get an email to set a password. The moment they log in
   for the first time, the function in this folder runs automatically and
   adds them to the Drive folder.

## 5. Test it

1. Invite yourself (or a test email you control) as a new Identity user.
2. Log in on `login.html`.
3. Check the Drive folder's Share dialog — your test email should now
   appear in the list within a few seconds.
4. Check **Netlify → Functions → identity → Logs** if it doesn't show up —
   the function logs exactly what happened (missing env vars, Drive API
   errors, etc.).

---

### Changing what access members get

In `netlify/functions/identity.mjs`, the line

```js
role: "reader",
```

controls what members can do in the folder. Change `"reader"` to `"writer"`
if members should be able to upload/edit documents themselves, not just view.

### Removing someone's access

This system only ever *adds* access — it never removes it automatically.
To revoke access, remove them from the Drive folder's Share dialog directly,
and also delete/block their Netlify Identity account so they can't log in.
Both steps matter; each system is independent of the other.
