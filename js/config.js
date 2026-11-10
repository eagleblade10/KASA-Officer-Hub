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
  calendarTimezone: "America/Chicago",

  // Google Drive folder the Drive tab opens to. Open the folder in Drive and copy the ID
  // from the URL (drive.google.com/drive/folders/THIS_PART). Leave "" to start at "My Drive".
  driveRootId: "https://drive.google.com/drive/folders/100vEo3hWdNF4T64wwOf_MRSJL15DxsA5?usp=drive_link",
  // "embed" (default): shows your Drive folder inside the page. No extra permissions, no Google warning screen.
  // "oauth": full Drive tab (create/rename/trash), but Google shows an "unverified app" warning. See README.
  driveMode: "embed",

  // Match these to your Slack committees. Paste the links you already use.
  teams: [
    { id: "media",   name: "Media",   color: "#10204a", desc: "Photo, video, graphics, social.", slack: "#", drive: "#", trello: "#" },
    { id: "finance", name: "Finance", color: "#8b2a33", desc: "Budget, refunds, funding.",       slack: "#", drive: "#", trello: "#" },
    { id: "events",  name: "Events",  color: "#2f6b4f", desc: "Planning and logistics.",         slack: "#", drive: "#", trello: "#" },
    { id: "outreach",name: "Outreach",color: "#111111", desc: "Recruitment and partners.",       slack: "#", drive: "#", trello: "#" },
  ],

  // Org-wide links shown on the Requests page and dashboard.
  forms: [
    { name: "Media request", desc: "Need photos, video, or graphics? Submit at least 2 weeks ahead.", url: "https://forms.gle/hbWE6E37GNH7X7zGA", embed: "" },
    { name: "Event proposal", desc: "Planning an event? Make your own copy of the proposal template, fill it in, and share it with the officers.", url: "https://docs.google.com/document/d/1LyyWxaIROciFyLrj3A7SsvSA0KqvW9rcIMV8TB8NNfk/copy", embed: "" },
    { name: "Reimbursement request", desc: "Attach receipts. Finance reviews weekly.", url: "https://forms.gle/ANRJmWjTmnt9YDmk8", embed: "" },
  ],
  turnaround: "Media: ~5 business days. Refunds: reviewed every Friday.",

  // Text alerts: people can add a phone number and tick a consent box. The exact wording below is saved with
  // each person's consent. Have an officer (or your advisor) read it, and edit it to match how you really text.
  sms: {
    enabled: true,
    disclosure: "I agree to receive recurring text messages from {org} about meetings, events, and deadlines at this number. Consent is not required to join. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for help.",
  },

  // Slack channel list that updates itself. Deploy worker/slack-channels.js (README), then paste its URL here.
  // Leave "" to hide the Channels tab.
  slack: { endpoint: "https://kasa-slack.eagleblade10.workers.dev" },

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
