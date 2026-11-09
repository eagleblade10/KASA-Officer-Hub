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
    apiKey: "AIzaSyAv0z8W9VbXlha-vMvAvJH_AT-LxpwfeD0",
    authDomain: "kasa-officer-hub.firebaseapp.com",
    projectId: "kasa-officer-hub",
    appId: "1:558420239913:web:d8930405aa79892ca59e38",
  },

  // Google Calendar: Settings > your calendar > "Integrate calendar" > Calendar ID
  calendarId: "", // e.g. "abc123@group.calendar.google.com"
  calendarTimezone: "America/Chicago",

  // Google Drive folder the Drive tab opens to. Open the folder in Drive and copy the ID
  // from the URL (drive.google.com/drive/folders/THIS_PART). Leave "" to start at "My Drive".
  driveRootId: "",

  // Match these to your Slack committees. Paste the links you already use.
  teams: [
    { id: "media",   name: "Media",   color: "#10204a", desc: "Photo, video, graphics, social.", slack: "#", drive: "#", trello: "#" },
    { id: "finance", name: "Finance", color: "#8b2a33", desc: "Budget, refunds, funding.",       slack: "#", drive: "#", trello: "#" },
    { id: "events",  name: "Events",  color: "#2f6b4f", desc: "Planning and logistics.",         slack: "#", drive: "#", trello: "#" },
    { id: "outreach",name: "Outreach",color: "#111111", desc: "Recruitment and partners.",       slack: "#", drive: "#", trello: "#" },
  ],

  // Org-wide links shown on the Requests page and dashboard.
  forms: [
    { name: "Media request",  desc: "Need photos, video, or graphics? Submit at least 2 weeks ahead.", url: "#", embed: "" },
    { name: "Refund request", desc: "Attach receipts. Finance reviews weekly.",                          url: "#", embed: "" },
  ],
  turnaround: "Media: ~5 business days. Refunds: reviewed every Friday.",

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
