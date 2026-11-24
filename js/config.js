// ============================================================
//  EDIT THIS FILE to make the hub yours. Nothing else needs changing.
// ============================================================
export const CONFIG = {
  orgName: "KASA at UT Austin",
  tagline: "One place for notes, plans, and requests.",
  about: "We're a student organization at UT Austin. Sign in to see meeting notes, projects, and how to reach each team.",
  joinUrl: "#", // public sign-up / interest form for the landing page
  meetingInfo: "General meetings: every other Tuesday, 7 PM, location TBD",
  accent: "#10204a", // main brand color (navy)
  accent2: "#8b2a33", // secondary brand color (red)

  // Firebase (see README step 1). Leave as-is to preview the site in DEMO mode.
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    appId: "PASTE_APP_ID",
  },

  // Google Calendar: Settings > your calendar > "Integrate calendar" > Calendar ID
  calendarId: "kasautaustin@gmail.com", // e.g. "abc123@group.calendar.google.com"
  calendarId: "", // e.g. "abc123@group.calendar.google.com"
  calendarTimezone: "America/Chicago",

  // Google Drive folder the Drive tab opens to. Open the folder in Drive and copy the ID
  // from the URL (drive.google.com/drive/folders/THIS_PART). Leave "" to start at "My Drive".
  driveRootId: "https://drive.google.com/drive/folders/100vEo3hWdNF4T64wwOf_MRSJL15DxsA5?usp=drive_link",
  driveRootId: "",
  // "embed" (default): shows your Drive folder inside the page. No extra permissions, no Google warning screen.
  // "oauth": full Drive tab (create/rename/trash), but Google shows an "unverified app" warning. See README.
  driveMode: "embed",
@@ -54,21 +54,21 @@

  // Slack channel list that updates itself. Deploy worker/slack-channels.js (README), then paste its URL here.
  // Leave "" to hide the Channels tab.
  slack: { endpoint: "https://kasa-slack.eagleblade10.workers.dev" },
  slack: { endpoint: "" },

  orgLinks: [
    { name: "Shared Drive (root)", url: "#" },
    { name: "Slack workspace",     url: "#" },
    { name: "Main Trello board",   url: "#" },
  ],

  // Project checkpoints, counted back from the project's due date.
  // These exist so work starts early instead of the week before.
  milestones: [
    { weeks: 6, label: "Kickoff: name an owner and make a budget plan" },
    { weeks: 4, label: "Submit media and refund requests; ask other teams for help" },
    { weeks: 2, label: "Promo live and cross-team check-in" },
    { weeks: 1, label: "Logistics locked" },
    { weeks: 0, label: "Event day / due date" },
  ],
};
