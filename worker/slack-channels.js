// Cloudflare Worker: connects the hub to Slack. It does three things.
//
//  1. GET  /        Lists Slack channels for OFFICERS: every public channel, plus the private channels that
//                   officer is in. (Members never get channels.)
//  2. POST /sync    Called when someone signs in to the hub. If their email belongs to an active person in your
//                   Slack workspace, they are made an officer automatically. If they were made an officer by Slack
//                   and have since left the workspace, that is removed.
//  3. Daily cleanup (Cron Trigger): removes Slack-made officers who are no longer in the workspace, even if they
//                   never sign in again.
//
// Officers added by hand in the Firebase console are never touched by Slack sync.
//
// Settings (Cloudflare Worker > Settings > Variables and secrets):
//   SLACK_BOT_TOKEN           (secret)  xoxb-... token
//   FIREBASE_SERVICE_ACCOUNT  (secret)  the whole service-account JSON file (needed for /sync and cleanup only)
//   FIREBASE_API_KEY                    apiKey from js/config.js
//   FIREBASE_PROJECT_ID                 projectId from js/config.js
//   ALLOWED_ORIGIN                      e.g. https://yourname.github.io  (no path, no trailing slash)

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));

// ---------- Slack ----------
async function slack(method, env, params = {}) {
  const r = await fetch("https://slack.com/api/" + method + "?" + new URLSearchParams(params), {
    headers: { Authorization: "Bearer " + env.SLACK_BOT_TOKEN },
  });
  return r.json();
}

// Active, full member of the workspace for this email, or null. Guests, bots and deactivated accounts don't count.
async function slackUser(env, email) {
  const r = await slack("users.lookupByEmail", env, { email });
  if (!r.ok) {
    if (r.error === "users_not_found") return null;
    throw new Error("Slack: " + r.error);
  }
  const u = r.user;
  if (!u || u.deleted || u.is_bot || u.is_restricted || u.is_ultra_restricted) return null;
  return u;
}

async function listAll(env, method, params) {
  const out = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const r = await slack(method, env, { ...params, ...(cursor ? { cursor } : {}) });
    if (!r.ok) throw new Error("Slack: " + r.error);
    out.push(...r.channels);
    cursor = r.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return out;
}

async function loadChannels(env, email) {
  const auth = await slack("auth.test", env);
  if (!auth.ok) throw new Error("Slack: " + auth.error);
  const pub = await listAll(env, "conversations.list", { types: "public_channel", exclude_archived: "true", limit: "200" });
  let priv = [];
  try {
    const u = await slackUser(env, email);
    // Private channels only appear if the app has been added to them, and only the ones THIS person is in.
    if (u) priv = await listAll(env, "users.conversations", { user: u.id, types: "private_channel", exclude_archived: "true", limit: "200" });
  } catch { /* no private channels if the lookup or the groups:read permission isn't available */ }
  const shape = (c, isPrivate) => ({ id: c.id, name: c.name, topic: c.topic?.value || c.purpose?.value || "", members: c.num_members || 0, private: isPrivate });
  const channels = [...pub.map((c) => shape(c, false)), ...priv.map((c) => shape(c, true))].sort((a, b) => a.name.localeCompare(b.name));
  return { team: auth.team_id, channels };
}

// ---------- Firebase admin access (service account) ----------
let adminCache = { token: "", exp: 0 };
async function adminToken(env) {
  if (adminCache.token && adminCache.exp > Date.now() + 60000) return adminCache.token;
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64urlStr(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + b64url(sig) }),
  });
  if (!r.ok) throw new Error("Google service account login failed");
  const j = await r.json();
  adminCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

const fsBase = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
async function fs(env, path, opts = {}) {
  const t = await adminToken(env);
  return fetch(fsBase(env) + path, { ...opts, headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" } });
}
async function getOfficer(env, email) {
  const r = await fs(env, "/officers/" + encodeURIComponent(email));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Firestore " + r.status);
  return { source: (await r.json()).fields?.source?.stringValue || "" };
}
async function createOfficer(env, email, name) {
  const body = { fields: { name: { stringValue: name || email }, source: { stringValue: "slack" }, created: { timestampValue: new Date().toISOString() } } };
  const r = await fs(env, "/officers?documentId=" + encodeURIComponent(email), { method: "POST", body: JSON.stringify(body) });
  if (!r.ok && r.status !== 409) throw new Error("Firestore " + r.status);
}
async function deleteOfficer(env, email) {
  await fs(env, "/officers/" + encodeURIComponent(email), { method: "DELETE" });
}

// Remove Slack-made officers who are no longer active in the workspace.
async function cleanup(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return;
  const r = await fs(env, ":runQuery", {
    method: "POST",
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "officers" }], where: { fieldFilter: { field: { fieldPath: "source" }, op: "EQUAL", value: { stringValue: "slack" } } } } }),
  });
  for (const row of await r.json()) {
    if (!row.document) continue;
    const email = decodeURIComponent(row.document.name.split("/").pop());
    try { if (!(await slackUser(env, email))) await deleteOfficer(env, email); } catch { /* on any error, leave them alone */ }
  }
}

// ---------- request handling ----------
export default {
  async fetch(req, env) {
    const cors = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN, "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!token) return json({ error: "Please sign in first." }, 401, cors);

    // Is this a real Firebase login with a verified email?
    const lk = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + env.FIREBASE_API_KEY, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
    });
    if (!lk.ok) return json({ error: "Login not recognized. Try signing in again." }, 401, cors);
    const user = (await lk.json()).users?.[0];
    if (!user?.email || !user.emailVerified) return json({ error: "Verified email required." }, 401, cors);
    const email = user.email.toLowerCase();

    // POST /sync: Slack membership decides officer status.
    if (new URL(req.url).pathname === "/sync") {
      if (!env.FIREBASE_SERVICE_ACCOUNT) return json({ role: "unavailable" }, 200, cors);
      try {
        const u = await slackUser(env, email), existing = await getOfficer(env, email);
        if (u) {
          if (!existing) await createOfficer(env, email, u.real_name || u.name);
          return json({ role: "officer" }, 200, cors);
        }
        if (existing?.source === "slack") await deleteOfficer(env, email); // only ever removes Slack-made officers
        return json({ role: "none" }, 200, cors);
      } catch (e) { return json({ error: e.message }, 502, cors); } // on error, change nothing
    }

    // GET /: channels, officers only. Asks Firestore as the caller, so your rules decide who an officer is.
    const base = fsBase(env);
    const isOfficer = (await fetch(`${base}/officers/${encodeURIComponent(email)}`, { headers: { Authorization: "Bearer " + token } })).status === 200;
    if (!isOfficer) return json({ error: "Channels are for officers only." }, 403, cors);

    const cache = caches.default, key = new Request("https://cache.invalid/slack-channels/" + encodeURIComponent(email));
    const hit = await cache.match(key);
    if (hit) return json(await hit.json(), 200, cors);
    let data;
    try { data = await loadChannels(env, email); } catch (e) { return json({ error: e.message }, 502, cors); }
    await cache.put(key, new Response(JSON.stringify(data), { headers: { "Cache-Control": "max-age=300", "Content-Type": "application/json" } }));
    return json(data, 200, cors);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};
