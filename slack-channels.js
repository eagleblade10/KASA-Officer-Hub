// Cloudflare Worker: lists your Slack workspace's PUBLIC channels so the hub's "Channels" tab stays up to date
// automatically. Your Slack token lives only here, as a Worker secret. It is never in GitHub or the website.
//
// Only signed-in members and officers get an answer: the Worker checks the caller's Firebase login, then checks
// that their email is in your Firestore `members` or `officers` collection.
//
// Set these in Cloudflare (Worker > Settings > Variables and secrets):
//   SLACK_BOT_TOKEN      (secret)  the xoxb-... Bot User OAuth Token
//   FIREBASE_API_KEY               same apiKey as in js/config.js
//   FIREBASE_PROJECT_ID            same projectId as in js/config.js
//   ALLOWED_ORIGIN                 your site's origin only, e.g. https://yourname.github.io  (no path, no trailing slash)

const json = (body, status, cors) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });

async function slack(method, env, params = {}) {
  const r = await fetch("https://slack.com/api/" + method + "?" + new URLSearchParams(params), {
    headers: { Authorization: "Bearer " + env.SLACK_BOT_TOKEN },
  });
  return r.json();
}

async function loadChannels(env) {
  const auth = await slack("auth.test", env);
  if (!auth.ok) throw new Error("Slack: " + auth.error);
  const channels = [];
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const r = await slack("conversations.list", env, { types: "public_channel", exclude_archived: "true", limit: "200", ...(cursor ? { cursor } : {}) });
    if (!r.ok) throw new Error("Slack: " + r.error);
    for (const c of r.channels) channels.push({ id: c.id, name: c.name, topic: c.topic?.value || c.purpose?.value || "", members: c.num_members || 0 });
    cursor = r.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  channels.sort((a, b) => a.name.localeCompare(b.name));
  return { team: auth.team_id, channels };
}

export default {
  async fetch(req, env) {
    const cors = { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN, "Access-Control-Allow-Headers": "Authorization", Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!token) return json({ error: "Please sign in first." }, 401, cors);

    // 1. Is this a real Firebase login?
    const lk = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + env.FIREBASE_API_KEY, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token }),
    });
    if (!lk.ok) return json({ error: "Login not recognized. Try signing in again." }, 401, cors);
    const user = (await lk.json()).users?.[0];
    if (!user?.email || !user.emailVerified) return json({ error: "Verified email required." }, 401, cors);
    const email = user.email.toLowerCase();

    // 2. Are they an approved member or an officer? (Asks Firestore as that user, so your rules decide.)
    const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
    const has = async (c) => (await fetch(`${base}/${c}/${encodeURIComponent(email)}`, { headers: { Authorization: "Bearer " + token } })).status === 200;
    if (!(await has("officers")) && !(await has("members"))) return json({ error: "Not approved yet." }, 403, cors);

    // 3. Slack channels, cached for 5 minutes so Slack's rate limits are never an issue.
    const cache = caches.default, key = new Request("https://cache.invalid/slack-channels");
    let hit = await cache.match(key), data;
    if (hit) data = await hit.json();
    else {
      try { data = await loadChannels(env); } catch (e) { return json({ error: e.message }, 502, cors); }
      await cache.put(key, new Response(JSON.stringify(data), { headers: { "Cache-Control": "max-age=300", "Content-Type": "application/json" } }));
    }
    return json(data, 200, cors);
  },
};
