// Merges what officers saved in the hub over the defaults in config.js, so day-to-day changes never touch GitHub.
//   "public" document   (anyone can read it, so nothing private): name, tagline, about, meeting info, join link,
//                       text-alert wording, Slack address, and each team's name, color and description.
//   "settings" document (approved people only): calendar, Drive folder, request forms, checkpoints, team links.
// Both are optional. With nothing saved, config.js is used as before.
export function applySettings(C, pub, set) {
  if (pub) {
    for (const k of ["orgName", "tagline", "about", "meetingInfo", "joinUrl"]) if (pub[k] !== undefined && (k !== "orgName" || pub[k])) C[k] = pub[k];
    if (pub.smsDisclosure) C.sms = { ...C.sms, disclosure: pub.smsDisclosure };
    if (pub.slackEndpoint !== undefined) C.slack = { ...C.slack, endpoint: pub.slackEndpoint };
    if (pub.teams?.length) C.teams = pub.teams.map((t) => ({ slack: "#", drive: "#", ...t }));
  }
  if (set) {
    for (const k of ["calendarId", "calendarTimezone", "driveRootId", "turnaround"]) if (set[k] !== undefined) C[k] = set[k];
    if (Array.isArray(set.forms)) C.forms = set.forms;
    if (set.milestones?.length) C.milestones = set.milestones;
    if (set.teams?.length) C.teams = set.teams.map((t) => ({ slack: "#", drive: "#", ...t }));
  }
}
