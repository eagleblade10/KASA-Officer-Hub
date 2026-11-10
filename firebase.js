import { CONFIG } from "./config.js";

export const configured = !String(CONFIG.firebase.apiKey).startsWith("PASTE");

const BASE = "https://www.gstatic.com/firebasejs/10.12.2/";
let A, F, auth, db;

if (configured) {
  const app = await import(BASE + "firebase-app.js");
  A = await import(BASE + "firebase-auth.js");
  F = await import(BASE + "firebase-firestore.js");
  const fbApp = app.initializeApp(CONFIG.firebase);
  auth = A.getAuth(fbApp);
  db = F.getFirestore(fbApp);
}

// ---------- DEMO mode (no Firebase yet): in-memory sample data ----------
const iso = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const mem = {
  announcements: [
    { id: "a1", title: "Welcome to the hub", body: "This is demo data. Connect Firebase (README) to make it real.", pinned: true, created: Date.now() },
  ],
  projects: [
    { id: "p1", name: "Fall Showcase", owner: "events", needsFrom: ["media", "finance"], due: iso(30), trello: "", drive: "", done: [0] },
    { id: "p2", name: "Recruitment Week", owner: "outreach", needsFrom: ["media"], due: iso(12), trello: "", drive: "", done: [] },
    { id: "p3", name: "General meetings", owner: "events", needsFrom: [], due: "", links: [{ name: "Agenda template", url: "#" }], done: [] },
    { id: "p4", name: "General meeting: Nov 4", owner: "events", parent: "p3", needsFrom: [], due: iso(-5), links: [{ name: "Slides", url: "#" }], done: [] },
    { id: "p5", name: "General meeting: Nov 18", owner: "events", parent: "p3", needsFrom: [], due: iso(9), links: [], done: [] },
  ],
  users: [ // sign-up requests
    { id: "sam@utexas.edu", email: "sam@utexas.edu", name: "Sam (demo)" },
    { id: "alex@utexas.edu", email: "alex@utexas.edu", name: "Alex (demo)" },
  ],
  members: [{ id: "jane@utexas.edu", email: "jane@utexas.edu", name: "Jane (demo)" }],
  links: [],
  smsConsent: [{ id: "jane@utexas.edu", email: "jane@utexas.edu", name: "Jane (demo)", phone: "+15125550123", consent: true, disclosure: "demo", consentedAt: new Date().toISOString() }],
  officers: [{ id: "demo@example.com", email: "demo@example.com", name: "Demo Officer" }],
  messages: [
    { id: "m1", from: "jane@utexas.edu", to: "demo@example.com", participants: ["jane@utexas.edu", "demo@example.com"], text: "Hey! Can Media cover the showcase on the 21st?", created: Date.now() - 3600e3 },
  ],
  notes: [
    { id: "n1", title: "General meeting", date: iso(-3), team: "all", project: "p4", url: "#" },
    { id: "n2", title: "Media sync", date: iso(-8), team: "media", project: "p1", url: "#" },
  ],
};
const subs = {};
const emit = (c) => (subs[c] || []).forEach((f) => f([...mem[c]]));

export function watch(c, cb) {
  if (configured) return F.onSnapshot(F.collection(db, c), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  (subs[c] = subs[c] || []).push(cb);
  cb([...mem[c]]);
}
export async function addItem(c, data) {
  if (configured) return F.addDoc(F.collection(db, c), { ...data, created: F.serverTimestamp() });
  mem[c].push({ id: "x" + Math.random(), ...data, created: Date.now() });
  emit(c);
}
export async function updateItem(c, id, data) {
  if (configured) return F.updateDoc(F.doc(db, c, id), data);
  Object.assign(mem[c].find((i) => i.id === id), data);
  emit(c);
}
export async function getItem(c, id) {
  if (!configured) return mem[c]?.find((i) => i.id === id) || null;
  const s = await F.getDoc(F.doc(db, c, id));
  return s.exists() ? { id, ...s.data() } : null;
}
export async function setItem(c, id, data) {
  if (configured) return F.setDoc(F.doc(db, c, id), { ...data, created: F.serverTimestamp() });
  mem[c] = mem[c].filter((i) => i.id !== id);
  mem[c].push({ id, ...data, created: Date.now() });
  emit(c);
}
export async function removeItem(c, id) {
  if (configured) return F.deleteDoc(F.doc(db, c, id));
  mem[c] = mem[c].filter((i) => i.id !== id);
  emit(c);
}

export async function upsertUser(user) {
  if (!configured) return;
  await F.setDoc(F.doc(db, "users", user.email.toLowerCase()), { email: user.email.toLowerCase(), name: user.displayName || user.email }, { merge: true });
}
export function watchDMs(email, cb) {
  if (configured) return F.onSnapshot(F.query(F.collection(db, "messages"), F.where("participants", "array-contains", email)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  const f = (l) => cb(l.filter((m) => m.participants.includes(email)));
  (subs.messages = subs.messages || []).push(f);
  f([...mem.messages]);
}

// ---------- Auth ----------
export function onAuth(cb) {
  if (!configured) return cb({ email: "demo@example.com", displayName: "Demo Officer" });
  A.onAuthStateChanged(auth, cb);
}
export async function signIn() {
  if (!configured) return;
  await A.signInWithPopup(auth, new A.GoogleAuthProvider());
}
// Asks for Google Drive access on top of normal sign-in. Returns a short-lived access token (about 1 hour).
export async function driveToken() {
  if (!configured) return null;
  const p = new A.GoogleAuthProvider();
  p.addScope("https://www.googleapis.com/auth/drive");
  if (auth.currentUser?.email) p.setCustomParameters({ login_hint: auth.currentUser.email });
  const r = await A.signInWithPopup(auth, p);
  return A.GoogleAuthProvider.credentialFromResult(r)?.accessToken || null;
}
export async function idToken() {
  return configured ? auth.currentUser.getIdToken() : null;
}
export async function signOutUser() {
  if (configured) await A.signOut(auth);
}
// "officer" | "member" | "pending". Demo mode: add ?as=pending to the URL to preview the waiting screen.
export async function getRole(user) {
  if (!configured) return new URLSearchParams(location.search).get("as") || "officer";
  const email = user.email.toLowerCase();
  for (const [c, role] of [["officers", "officer"], ["members", "member"]]) {
    try { if ((await F.getDoc(F.doc(db, c, email))).exists()) return role; } catch {}
  }
  return "pending";
}
export async function isOfficer(user) {
  if (!configured) return true;
  try {
    const snap = await F.getDoc(F.doc(db, "officers", user.email));
    return snap.exists();
  } catch {
    return false;
  }
}
