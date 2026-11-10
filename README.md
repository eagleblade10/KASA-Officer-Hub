# Org Hub

A dashboard for your student org, hosted free on GitHub Pages.

- **Public landing page** (`index.html`) for recruitment.
- **Member dashboard** (`app.html`) behind Google sign-in.
- **Home:** the next 14 days of checkpoints, announcements, latest notes, request forms.
- **Teams:** one page per Slack committee, with its links and **asks from other teams**.
- **Projects:** checkpoints auto-generated from the due date (6, 4, 2, 1 weeks, then day-of). Projects can hold
  **sub-projects** (for example "General meetings" with one per meeting), each with its own links and meeting notes.
- **Meeting notes:** searchable index that links out to your Google Docs.
- **Messages:** direct messages between signed-in members.
- **Drive:** browse, search, preview, create, rename and trash files in your shared Drive folder.
- **Calendar and Requests:** embedded Google Calendar and your Forms.

Open `app.html` as-is to preview in **demo mode** (sample data, nothing saved).
Because the code uses ES modules, preview through a server, not by double-clicking:
`python -m http.server` in this folder, then visit http://localhost:8000.

## Setup (about 20 minutes)

### 1. Create the Firebase project (free)
1. Go to https://console.firebase.google.com and click **Add project**.
2. **Build > Authentication > Get started > Google**, then enable it.
3. **Build > Firestore Database > Create database** (production mode).
4. **Firestore > Rules**: paste the contents of `firestore.rules` and **Publish**.
5. **Project settings > Your apps > Web (</>)**: register an app and copy the config values into `js/config.js`.

### 2. Add officers
In Firestore, create a collection named `officers`. For each officer, add a document whose
**Document ID is their Google email, in lowercase** (for example `jane@utexas.edu`). It needs at least one field,
such as `name`. Anyone listed can add, edit and delete content, and can approve new members from the **People** tab.
This list is the only place officers are defined. The website cannot change it.

### 3. Customize `js/config.js`
Org name, brand color, teams (match your Slack committees), Drive/Trello/Slack links, form URLs,
Calendar ID, and the checkpoint schedule.
- **Calendar ID:** Google Calendar > Settings > your calendar > Integrate calendar.
- **Forms embed URL:** in Google Forms, Send > `<>` embed, then copy the `src` link.
- The calendar must be shared as "public" or to your org for the embed to show for everyone.

### 4. Publish on GitHub
1. Create a repo and upload all of these files to the top level (keep the folders and the `.nojekyll` file).
2. **Settings > Pages > Deploy from branch > main / root.**
3. Your site is at `https://USERNAME.github.io/REPO/`.
4. Back in Firebase: **Authentication > Settings > Authorized domains > Add** `USERNAME.github.io`.

## Day-to-day use
- Officers: **+ Add notes link** after each meeting (paste the Google Doc URL and pick a team).
- Create a **project** as soon as an event is planned. Tick checkpoints off as you go.
- Mark which teams a project **needs help from**, and it shows up on their team page.
- Post pinned **announcements** for things that keep getting lost in Slack.

## Slack channels that update themselves
The **Channels** tab lists your workspace's public channels, so new ones appear without editing anything. A website
can't safely hold a Slack token, so a tiny free "Cloudflare Worker" holds it instead. Only approved members get an answer.

1. **Create a Slack app:** go to https://api.slack.com/apps > **Create New App > From scratch**, name it, pick your workspace.
2. **OAuth & Permissions > Bot Token Scopes > Add** `channels:read`. Then click **Install to Workspace**
   (a workspace admin may need to approve it). Copy the **Bot User OAuth Token** (starts with `xoxb-`).
3. **Cloudflare:** make a free account at cloudflare.com, then **Workers & Pages > Create > Create Worker**, name it, **Deploy**,
   then **Edit code**, paste in everything from `worker/slack-channels.js`, and **Deploy** again.
4. In the Worker: **Settings > Variables and secrets > Add**:
   - `SLACK_BOT_TOKEN` (type **Secret**) = the xoxb- token
   - `FIREBASE_API_KEY` = your Firebase apiKey, `FIREBASE_PROJECT_ID` = your projectId
   - `ALLOWED_ORIGIN` = `https://YOURUSERNAME.github.io` (no path, no trailing slash)
5. Copy the Worker's URL (like `https://name.you.workers.dev`) into `slack: { endpoint: "..." }` in `js/config.js`.

**Never paste the xoxb- token into GitHub, `config.js`, or chat.** Only into the Cloudflare secret.
Each team page also shows channels whose names contain the team's id or name (e.g. `media` matches `media-requests`).
Private channels aren't listed.

## Drive tab
`driveMode` in `js/config.js` has two settings:
- **`"embed"` (default):** shows your Drive folder inside the page. No extra permissions and **no "unverified app"
  warning**. Members see what their own Google account can already open. Share the folder with them in Drive.
- **`"oauth"`:** the full tab (create, rename, trash, "log as meeting note"). Google shows an **"unverified app"** warning
  because full Drive access is a sensitive permission, and removing it needs Google's formal app verification (not
  realistic for a student org). Members can click **Advanced > Go to app** to continue. Use the setup steps below only for this mode.

### Extra setup for `oauth` mode
The Drive tab lets signed-in members work with files in your org's Drive folder from the site. Each person only
sees and changes what their own Google account can already access, so **share your org folder with your members**
in Drive. Editing text happens in Google Docs/Sheets (the site opens them), and "Trash" is recoverable for 30 days.

1. In the [Google Cloud console](https://console.cloud.google.com) pick the same project as your Firebase project
   (Firebase project settings shows the ID).
2. **APIs & Services > Library > Google Drive API > Enable.**
3. **APIs & Services > OAuth consent screen** (or "Google Auth Platform"): choose **External**, fill in the app name
   and your email, then **add the scope** `https://www.googleapis.com/auth/drive`.
4. Either add members as **test users** (up to 100, no warning screen problems for them), or **publish** the app.
   A published app that Google hasn't verified shows an "unverified app" warning; people click Advanced, then
   Continue. Removing that warning requires Google's verification for this sensitive scope.
5. In `js/config.js`, set `driveRootId` to your org folder's ID (the last part of its Drive URL).
6. Members click **Connect Google Drive** on the Drive tab. The access token lasts about an hour, then they reconnect.

**Security, please read:** the `drive` scope gives the page's code access to the *entire* Drive of whoever
connects, not just your folder. Google can't limit it to one folder. So whoever can edit this GitHub repo can
change the site to read members' Drives. Keep repo write access to a few trusted officers, and don't add scripts
from other sites. If that's too much trust, change the scope in `js/firebase.js` to `drive.file` (the site then
only touches files it created itself) and remove the browsing feature.

## Direct messages
Messages are stored in Firestore. Only the two people in a conversation can read it through the site (enforced by
`firestore.rules`, so re-publish the rules after updating). They are **not end-to-end encrypted**, and anyone with
admin access to your Firebase project can see them. Use Slack or email for anything sensitive. Only approved members and officers appear in
the "New message" list.

## Text alerts
People can add a US mobile number under **Profile** (or on the "waiting for approval" screen) and tick an
unchecked consent box. The exact wording lives in `js/config.js` (`sms.disclosure`) and is saved with each person's
consent, along with the time they agreed. Officers see the opted-in list in the **People** tab and can download a CSV.

**This site cannot send texts.** Sending needs a texting service. Upload the CSV to it (for example Twilio or a
campus-friendly tool like GroupMe or Remind).

**Legal reality check (not legal advice):**
- A checkbox helps but isn't the whole thing. US rules (TCPA, plus carrier rules) expect clear wording that names the
  org, says messages are recurring, mentions message and data rates, explains STOP and HELP, and keeps a record of consent.
  The default wording and saved records are built to cover that, but have your org advisor or UT's student org office look at it.
- Don't pre-check the box, don't make texts a condition of joining, and don't text anyone who hasn't opted in.
- **Honor STOP right away.** Your texting service handles STOP replies on its side. Click **Mark STOP** here too so the
  list stays accurate, and delete those numbers from the service.
- Sending marketing-style texts from a normal US number needs carrier registration (10DLC) with most services,
  and that usually costs a little each month. Personal-phone group texts and apps like GroupMe avoid that.
- Re-publish `firestore.rules` after updating the site.

## Private links (Trello invites, etc.)
`js/config.js` is a **public file**: anyone on the internet can open it, even without signing in. Don't put anything
in it that you wouldn't post publicly. Trello invite links in particular let anyone who has them join the board.
Instead, officers click **+ Add link** under Quick links on the Home tab. Those are stored in the database and only
approved members can see them. Use `config.js` only for links that are fine to be public (form links, for example).

## Spam and abuse checklist
- Nobody can read anything until an officer approves them, and pending people can only write their own sign-up and text-consent records.
- Officers can't be created from the website, only in the Firebase console.
- Messages are capped at 2,000 characters and names at 100; phone numbers must be valid US numbers.
- Decline on the People tab clears a request. If someone keeps re-requesting, just ignore them.
- **Turn on a budget alert** in Google Cloud (Billing > Budgets & alerts, for example $1) so a flood of traffic can't surprise you.
  The free tier covers a student org easily.
- Keep GitHub repo write access to a few trusted officers.

## Who can do what
- **Anyone** can sign in with Google. A brand-new person is **pending**: they see only a "Waiting for approval"
  screen and can read nothing.
- **Members** are approved by officers in the **People** tab (Approve / Decline / Remove). Members can read
  everything and send DMs.
- **Officers** are the fixed list in the `officers` collection (added in the Firebase console only). They can edit
  content and approve members. The first officer has to be added in the console, since nobody can approve themselves.

Re-publish `firestore.rules` after updating the site, or approvals won't take effect.

Google Docs and Drive keep their own sharing settings, so a note's link only opens for people with access to that Doc.
