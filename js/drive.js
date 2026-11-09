import { CONFIG as C } from "./config.js";
import * as fb from "./firebase.js";

const API = "https://www.googleapis.com/drive/v3";
const KEY = "drive_token";
export const FOLDER = "application/vnd.google-apps.folder";
export const TYPES = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
  folder: FOLDER,
};
export const rootId = () => C.driveRootId || "root";
export const rootName = () => (C.driveRootId ? "Org Drive" : "My Drive");

// The access token lives only in this tab's sessionStorage (~1 hour). It is never sent anywhere except Google.
function token() {
  try { const t = JSON.parse(sessionStorage.getItem(KEY) || "null"); return t && t.exp > Date.now() ? t.v : null; } catch { return null; }
}
export const connected = () => !fb.configured || !!token();
export async function connect() {
  if (!fb.configured) return;
  const v = await fb.driveToken();
  if (!v) throw new Error("Google did not return Drive access.");
  try { sessionStorage.setItem(KEY, JSON.stringify({ v, exp: Date.now() + 55 * 60e3 })); } catch {}
}
export function disconnect() { try { sessionStorage.removeItem(KEY); } catch {} }

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" } });
  if (r.status === 401) { disconnect(); throw new Error("expired"); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error?.message || "Drive error " + r.status); }
  return r.status === 204 ? null : r.json();
}

// ---------- demo mode: fake files so you can preview the page ----------
const now = new Date().toISOString();
let mock = [
  { id: "f1", name: "Meeting Notes", mimeType: FOLDER, parent: "root" },
  { id: "f2", name: "Media", mimeType: FOLDER, parent: "root" },
  { id: "d1", name: "General meeting 11-04", mimeType: TYPES.doc, parent: "f1" },
  { id: "d2", name: "Showcase shot list", mimeType: TYPES.doc, parent: "f2" },
  { id: "s1", name: "Semester budget", mimeType: TYPES.sheet, parent: "root" },
].map((f) => ({ ...f, modifiedTime: now, webViewLink: "#" }));

// ---------- operations ----------
const FIELDS = "id,name,mimeType,modifiedTime,webViewLink";
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function list(parent, q = "") {
  if (!fb.configured) return mock.filter((f) => f.parent === parent && f.name.toLowerCase().includes(q.toLowerCase()));
  let query = `'${esc(parent)}' in parents and trashed=false`;
  if (q) query += ` and name contains '${esc(q)}'`;
  const p = new URLSearchParams({ q: query, fields: `files(${FIELDS})`, orderBy: "folder,name", pageSize: "100", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  return (await api("/files?" + p)).files;
}
export async function create(name, mimeType, parent) {
  if (!fb.configured) { const f = { id: "x" + Math.random(), name, mimeType, parent, modifiedTime: new Date().toISOString(), webViewLink: "#" }; mock.push(f); return f; }
  return api(`/files?supportsAllDrives=true&fields=${FIELDS}`, { method: "POST", body: JSON.stringify({ name, mimeType, parents: [parent] }) });
}
export async function rename(id, name) {
  if (!fb.configured) { mock.find((f) => f.id === id).name = name; return; }
  return api(`/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, { method: "PATCH", body: JSON.stringify({ name }) });
}
// Moves to Drive's trash (recoverable for 30 days). Nothing here deletes permanently.
export async function trash(id) {
  if (!fb.configured) { mock = mock.filter((f) => f.id !== id); return; }
  return api(`/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
}
