# Org Hub

A dashboard for your student org, hosted free on GitHub Pages.

- **Public landing page** (`index.html`) for recruitment.
- **Member dashboard** (`app.html`) behind Google sign-in.
- **Home:** the next 14 days of checkpoints, announcements, latest notes, request forms.
- **Teams:** one page per Slack committee, with its links and **asks from other teams**.
- **Projects:** checkpoints auto-generated from the due date (6, 4, 2, 1 weeks, then day-of).
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
such as `name`. Anyone listed can add, edit and delete content. Everyone else signed in can only read.

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

## Google Drive tab (extra setup)
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
admin access to your Firebase project can see them. Use Slack or email for anything sensitive. People show up in
the "New message" list after they've signed in once.

## Privacy note
You chose "any Google account" sign-in, so anyone with a Google account can sign in and read the dashboard.
Keep sensitive things (receipts, personal contact info, private Docs) out of it. Google Docs keep their own
sharing settings, so a note's link still only opens for people who have access to that Doc. To restrict
reading to approved people, change the `read` rules in `firestore.rules` to require `isOfficer()` or a
`members` collection, as with officers.
