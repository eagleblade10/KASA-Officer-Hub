import { CONFIG as C } from "./config.js";
import * as fb from "./firebase.js";
import * as drive from "./drive.js";
import { applySettings } from "./settings.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const url = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
const state = { user: null, officer: false, announcements: [], projects: [], notes: [], users: [], messages: [], members: [], officers: [], signups: [], pending: false, sms: null, nick: "", smsList: [], links: [], publicLinks: [], publicNotes: [], pages: [], pubDoc: null, setDoc: null, teamPerms: {}, blocked: [], mirrored: false, preview: false, canPreview: false, slack: null, slackErr: "", slackLoading: false };
const team = (id) => C.teams.find((t) => t.id === id);
const chip = (id) => { const t = team(id); return t ? `<span class="chip" style="--c:${esc(t.color)}">${esc(t.name)}</span>` : id === "all" ? `<span class="chip">All org</span>` : ""; };

document.documentElement.style.setProperty("--accent", C.accent);
document.documentElement.style.setProperty("--red", C.accent2);
const pageTitle = () => (/hub/i.test(C.orgName) ? C.orgName : C.orgName + " Hub");
document.title = pageTitle();
$("#brand").textContent = C.orgName;
$("#demo").hidden = fb.configured;

// ---------- dates ----------
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parse = (s) => new Date(s + "T00:00:00");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysFrom = (d) => Math.round((d - today0()) / 864e5);
const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const rel = (n) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : `${-n} day${n === -1 ? "" : "s"} overdue`);
const cls = (n) => (n < 0 ? "late" : n <= 3 ? "soon" : "");
const ms = (x) => x?.toMillis?.() ?? (typeof x === "number" ? x : 0);

function checkpoints(p) {
  if (!p.due || p.parent) return []; // folders and sub-projects (like meetings) have no checkpoints
  const due = parse(p.due);
  return C.milestones.map((m, i) => ({ i, label: m.label, date: addDays(due, -7 * m.weeks), done: (p.done || []).includes(i) }));
}
const progress = (p) => !C.milestones.length || !p.due ? 0 : Math.round((100 * (p.done || []).length) / C.milestones.length);

// ---------- generic form dialog ----------
function openForm(title, fields, onSubmit) {
  const f = $("#dform");
  f.innerHTML = `<h2>${esc(title)}</h2>` + fields.map((x) => {
    if (x.type === "select") return `<label>${esc(x.label)}<select name="${x.name}">${x.options.map((o) => `<option value="${esc(o.value)}" ${o.value === x.value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>`;
    if (x.type === "checks") return `<label>${esc(x.label)}</label><div class="checks"${x.scroll ? ' style="max-height:150px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px"' : ""}>${x.options.map((o) => `<label class="inline"><input type="checkbox" name="${x.name}" value="${esc(o.value)}" ${(x.value || []).includes(o.value) ? "checked" : ""}>${esc(o.label)}</label>`).join("")}</div>`;
    if (x.type === "check") return `<label class="inline"><input type="checkbox" name="${x.name}" ${x.value ? "checked" : ""}>${esc(x.label)}</label>`;
    if (x.type === "textarea") return `<label>${esc(x.label)}<textarea name="${x.name}" rows="${x.rows || 3}">${esc(x.value || "")}</textarea></label>`;
    return `<label>${esc(x.label)}<input name="${x.name}" type="${x.type || "text"}" ${x.required ? "required" : ""} placeholder="${esc(x.ph || "")}" value="${esc(x.value || "")}"></label>`;
  }).join("") + `<div class="row" style="margin-top:16px"><button type="button" class="btn" id="cancel">Cancel</button><button class="btn pri">Save</button></div>`;
  $("#cancel").onclick = () => $("#dlg").close();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const out = {};
    for (const x of fields) {
      if (x.type === "checks") out[x.name] = [...f.querySelectorAll(`[name=${x.name}]:checked`)].map((i) => i.value);
      else if (x.type === "check") out[x.name] = f.elements[x.name].checked;
      else out[x.name] = (f.elements[x.name].value || "").trim();
    }
    try { await onSubmit(out); $("#dlg").close(); } catch (err) { alert("Could not save: " + err.message); }
  };
  $("#dlg").showModal();
}
const teamOpts = (all) => [...(all ? [{ value: "all", label: "All org" }] : []), ...C.teams.map((t) => ({ value: t.id, label: t.name }))];

// ---------- views ----------
const MEMBER_TABS = ["home", "calendar", "profile"]; // everything a plain member can open
const ROUTES = [["home", "Home"], ["start", "Start here"], ["teams", "Teams"], ["projects", "Projects"], ["notes", "Meeting notes"], ["messages", "Messages"], ["drive", "Drive"], ["slack", "Channels"], ["people", "People"], ["settings", "Settings"], ["profile", "Profile"], ["calendar", "Calendar"], ["requests", "Requests"]];
const officerBtn = (label, action, extra = "") => (state.officer ? `<button class="btn pri sm" data-a="${action}" ${extra}>${label}</button>` : "");
const delBtn = (coll, id) => (state.officer ? `<button class="btn sm del" data-a="del" data-c="${coll}" data-id="${esc(id)}">Delete</button>` : "");

const sortedAnns = (aud) => state.announcements.filter((a) => (a.audience === "members" ? "members" : "officers") === aud).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ms(b.created) - ms(a.created));
const annList = (list) => list.length ? list.map((a) => `<div class="card ${a.pinned ? "pin" : ""}" style="margin-top:8px"><div class="row"><strong>${a.pinned ? "📌 " : ""}${esc(a.title)}</strong>${delBtn("announcements", a.id)}</div><div style="white-space:pre-wrap">${esc(a.body)}</div></div>`).join("") : `<p class="empty">No announcements.</p>`;
// Linktree-style: one wide button per link. Officers also get a small × to remove one.
const linkButtons = () => [...state.publicLinks].sort((a, b) => ms(a.created) - ms(b.created)).map((l) => `<div class="row" style="margin:6px 0;flex-wrap:nowrap"><a class="btn" style="flex:1;text-align:center;padding:10px" target="_blank" rel="noopener" href="${url(l.url)}">${esc(l.name)}</a>${state.officer ? `<button class="btn sm del" data-a="del" data-c="publicLinks" data-id="${esc(l.id)}" title="Remove">×</button>` : ""}</div>`).join("");
const calSrc = (extra = "") => `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(C.calendarId)}&ctz=${encodeURIComponent(C.calendarTimezone)}&showTitle=0${extra}`;

// Officer home: the same as before, plus member announcements and member links so officers can manage what members see.
function viewHome() {
  const upcoming = state.projects.flatMap((p) => checkpoints(p).filter((c) => !c.done).map((c) => ({ ...c, p, n: daysFrom(c.date) })))
    .filter((c) => c.n <= 14).sort((a, b) => a.n - b.n);
  const notes = [...state.notes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return `
  <div class="row"><h1>Next 14 days</h1><span class="muted">Checkpoints from every project, soonest first</span></div>
  <div class="grid cols-2" style="margin-top:12px">
    <div class="card"><h2>Coming up</h2>${upcoming.length ? `<ul class="list">${upcoming.map((c) => `
      <li><div class="row"><span><strong>${esc(c.p.name)}</strong> ${chip(c.p.owner)}</span><span class="due ${cls(c.n)}">${rel(c.n)}</span></div>
      <div class="muted">${esc(c.label)} · ${fmt(c.date)}</div></li>`).join("")}</ul>` : `<p class="empty">Nothing due in the next two weeks. 🎉</p>`}</div>

    <div class="card"><div class="row"><h2>Officer announcements</h2>${officerBtn("+ Post", "addAnn", 'data-aud="officers"')}</div>${annList(sortedAnns("officers"))}</div>

    <div class="card"><div class="row"><h2>Member announcements</h2>${officerBtn("+ Post", "addAnn", 'data-aud="members"')}</div><p class="muted">Members see these on their home page.</p>${annList(sortedAnns("members"))}</div>

    <div class="card"><div class="row"><h2>Member links</h2>${officerBtn("+ Add link", "addPubLink")}</div><p class="muted">Shown to members on their home page, like a Linktree.</p>${linkButtons() || `<p class="empty">No links yet.</p>`}</div>

    <div class="card"><div class="row"><h2>Latest meeting notes</h2><a href="#notes">All notes</a></div>
      ${notes.length ? `<ul class="list">${notes.map(noteLi).join("")}</ul>` : `<p class="empty">No notes yet.</p>`}</div>

    <div class="card"><h2>Requests</h2><p class="muted">${esc(C.turnaround)}</p>
      <div class="grid">${C.forms.map((f) => `<div><strong>${esc(f.name)}</strong><div class="muted">${esc(f.desc)}</div><a class="btn pri sm" target="_blank" rel="noopener" href="${url(f.url)}">Open form</a></div>`).join("")}</div>
      <div class="row" style="margin-top:14px"><h3>Quick links</h3>${officerBtn("+ Add link", "addLink")}</div>${[...C.orgLinks.filter((l) => l.url && l.url !== "#"), ...state.links].map((l) => `<a class="btn sm" target="_blank" rel="noopener" href="${url(l.url)}">${esc(l.name)}</a>${l.id && state.officer ? `<button class="btn sm del" data-a="del" data-c="links" data-id="${esc(l.id)}" title="Remove">×</button>` : ""} `).join("")}
    </div>
  </div>`;
}

// Member home: member announcements, what's coming up, links, and the meeting notes officers tagged public.
function viewMemberHome() {
  const notes = [...state.publicNotes].sort((a, b) => b.date.localeCompare(a.date));
  return `<h1>Hi, ${esc(myName())} 👋</h1>
  <div class="grid cols-2" style="margin-top:12px">
    <div class="card"><h2>Announcements</h2>${annList(sortedAnns("members"))}</div>
    <div class="card"><h2>Coming up</h2>${C.calendarId ? `<iframe src="${calSrc("&mode=AGENDA&showNav=0&showDate=0&showPrint=0&showTabs=0&showCalendars=0&showTz=0")}" style="height:320px" title="Coming up"></iframe><p class="muted"><a href="#calendar">See the full calendar</a></p>` : `<p class="empty">The calendar isn't connected yet.</p>`}</div>
    <div class="card"><h2>Links</h2>${linkButtons() || `<p class="empty">No links yet.</p>`}</div>
    <div class="card"><h2>Meeting notes</h2><details><summary style="cursor:pointer">Show the list (${notes.length})</summary>${notes.length ? `<ul class="list">${notes.map(pubNoteLi).join("")}</ul>` : `<p class="empty">No notes shared yet.</p>`}</details></div>
  </div>`;
}

function noteLi(n) {
  const pr = state.projects.find((p) => p.id === n.project);
  return `<li><div class="row"><span><a target="_blank" rel="noopener" href="${url(n.url || n.slides)}"><strong>${esc(n.title)}</strong></a>${n.url && n.slides ? ` <a class="btn sm" target="_blank" rel="noopener" href="${url(n.slides)}">Slides</a>` : ""} ${chip(n.team)}${shareChip(n)}${pr ? `<span class="muted">· <a href="#projects/${esc(pr.id)}">${esc(projName(pr))}</a></span>` : ""}</span><span class="muted">${fmt(parse(n.date))} ${state.officer ? `<button class="btn sm" data-a="note-edit" data-id="${esc(n.id)}">Edit</button> ` : ""}${delBtn("notes", n.id)}</span></div></li>`;
}

function viewTeams(id) {
  if (!id) return `<h1>Teams</h1><div class="grid cols-3">${C.teams.map((t) => {
    const open = state.projects.filter((p) => p.owner === t.id).length, asks = state.projects.filter((p) => (p.needsFrom || []).includes(t.id) && p.owner !== t.id).length;
    return `<a class="card" href="#teams/${t.id}" style="text-decoration:none;color:inherit;border-top:5px solid ${esc(t.color)}"><h2>${esc(t.name)}</h2><p class="muted">${esc(t.desc)}</p><div class="muted">${open} project${open === 1 ? "" : "s"} · ${asks} ask${asks === 1 ? "" : "s"} from others</div></a>`;
  }).join("")}</div>`;
  const t = team(id); if (!t) return `<p>Team not found.</p>`;
  const own = state.projects.filter((p) => p.owner === id && !p.parent), asks = state.projects.filter((p) => (p.needsFrom || []).includes(id) && p.owner !== id && !p.parent);
  const notes = state.notes.filter((n) => n.team === id).sort((a, b) => b.date.localeCompare(a.date));
  return `<p><a href="#teams">← All teams</a></p><div class="row"><h1>${chip(id)} ${esc(t.name)}</h1><span>
    ${["slack", "drive"].filter((k) => t[k] && t[k] !== "#").map((k) => `<a class="btn sm" target="_blank" rel="noopener" href="${url(t[k])}">${k[0].toUpperCase() + k.slice(1)}</a>`).join(" ")}</span></div><p class="muted">${esc(t.desc)}</p>
  <div class="grid cols-2">
    <div class="card"><h2>Asks from other teams</h2><p class="muted">Projects that need something from ${esc(t.name)}.</p>${asks.length ? `<ul class="list">${asks.map((p) => { const nx = checkpoints(p).find((c) => !c.done); return `<li><strong>${esc(p.name)}</strong> ${chip(p.owner)}<div class="muted">${nx ? `${esc(nx.label)} · <span class="due ${cls(daysFrom(nx.date))}">${rel(daysFrom(nx.date))}</span>` : "All checkpoints done"}</div></li>`; }).join("")}</ul>` : `<p class="empty">No open asks.</p>`}</div>
    <div class="card"><h2>${esc(t.name)} projects</h2>${own.length ? `<ul class="list">${own.map((p) => `<li><strong>${esc(p.name)}</strong> <span class="muted">${p.due ? "due " + fmt(parse(p.due)) + " · " + progress(p) + "%" : "folder"}</span></li>`).join("")}</ul>` : `<p class="empty">None yet.</p>`}</div>
    ${teamChannels(t)}
    ${teamRosterCards(t)}
    <div class="card"><h2>Meeting notes</h2>${notes.length ? `<ul class="list">${notes.map(noteLi).join("")}</ul>` : `<p class="empty">None yet.</p>`}</div>
  </div>`;
}

// ---------- Projects: nested sub-projects, descriptions, and assignments to teams and people ----------
const ancestors = (p) => {
  const out = [], seen = new Set([p.id]);
  for (let cur = p; cur.parent && !seen.has(cur.parent);) {
    const par = state.projects.find((x) => x.id === cur.parent);
    if (!par) break;
    out.unshift(par); seen.add(par.id); cur = par;
  }
  return out;
};
const projName = (p) => [...ancestors(p), p].map((x) => x.name).join(" › ");
const descendants = (id) => {
  const out = [], seen = new Set([id]), stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const c of state.projects.filter((x) => x.parent === cur)) if (!seen.has(c.id)) { seen.add(c.id); out.push(c); stack.push(c.id); }
  }
  return out;
};
const projLinks = (p) => [
  ...(p.links || []).map((l, i) => ({ ...l, i })),
  ...(p.trello ? [{ name: "Trello", url: p.trello, legacy: "trello" }] : []), // older projects only
  ...(p.drive ? [{ name: "Drive folder", url: p.drive, legacy: "drive" }] : []),
];
const peopleOpts = () => [...state.users].sort((a, b) => a.name.localeCompare(b.name)).map((u) => ({ value: u.email, label: u.name }));
const personChip = (e) => `<span class="chip" style="--c:#10204a">${esc(nameOf(e))}</span>`;
const assignedLine = (p) => `<div>${p.owner ? `Team ${chip(p.owner)}` : ""} ${(p.needsFrom || []).length ? `<span class="muted">with</span> ${p.needsFrom.map(chip).join("")}` : ""} ${(p.assignees || []).length ? `<span class="muted">People</span> ${p.assignees.map(personChip).join("")}` : ""}</div>`;
const projectFields = (p = {}, withDate = true) => [
  { name: "name", label: "Name", required: true, value: p.name },
  { name: "description", label: "Description", type: "textarea", rows: 4, value: p.description },
  { name: "owner", label: "Lead team", type: "select", options: teamOpts(), value: p.owner },
  { name: "needsFrom", label: "Other teams involved", type: "checks", options: teamOpts(), value: p.needsFrom },
  { name: "assignees", label: "People assigned", type: "checks", scroll: true, options: peopleOpts(), value: p.assignees },
  ...(withDate ? [{ name: "due", label: "Due / event date (optional; a date on a top-level project adds automatic checkpoints)", type: "date", value: p.due }] : []),
];
const cpRows = (p) => checkpoints(p).map((c) => `<div class="cp ${c.done ? "done" : ""}"><input type="checkbox" style="width:auto" ${c.done ? "checked" : ""} ${canDates(p) ? "" : "disabled"} data-a="tog" data-id="${esc(p.id)}" data-i="${c.i}"><span>${esc(c.label)} <span class="muted">· ${fmt(c.date)}</span></span></div>`).join("");

function projCard(p) {
  const n = p.due ? daysFrom(parse(p.due)) : null, subs = state.projects.filter((x) => x.parent === p.id).length, tracked = checkpoints(p).length > 0;
  return `<div class="card"><div class="row"><h2><a href="#projects/${esc(p.id)}" style="text-decoration:none">${esc(p.name)}</a></h2>${p.due ? `<span class="due ${cls(n)}">${fmt(parse(p.due))} · ${rel(n)}</span>` : ""}</div>
    ${p.description ? `<p class="muted" style="white-space:pre-wrap">${esc(p.description.slice(0, 160))}${p.description.length > 160 ? "…" : ""}</p>` : ""}
    ${assignedLine(p)}
    ${tracked ? `<div class="bar"><i style="width:${progress(p)}%"></i></div>${cpRows(p)}` : ""}
    <div style="margin-top:8px"><a class="btn sm" href="#projects/${esc(p.id)}">Open</a> <span class="muted">${subs} sub-project${subs === 1 ? "" : "s"}</span></div></div>`;
}

function viewProjects(arg) {
  if (arg) return viewProject(decodeURIComponent(arg));
  const top = state.projects.filter((p) => !p.parent).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  const mine = state.projects.filter((p) => (p.assignees || []).some((e) => key(e) === me()));
  return `<div class="row"><h1>Projects</h1>${officerBtn("+ New project", "addProj")}</div>
  <p class="muted">Open a project to see its description, who's on it, its sub-projects, links and notes. Sub-projects can go as deep as you like. A date on a top-level project adds automatic checkpoints; leave it blank for a folder like "General meetings".</p>
  ${mine.length ? `<div class="card" style="margin-bottom:16px"><h2>Assigned to you</h2><ul class="list">${mine.map((p) => `<li><a href="#projects/${esc(p.id)}"><strong>${esc(projName(p))}</strong></a>${p.due ? ` <span class="muted">${fmt(parse(p.due))}</span>` : ""}</li>`).join("")}</ul></div>` : ""}
  <div class="grid cols-2">${top.map(projCard).join("") || `<p class="empty">No projects yet.</p>`}</div>`;
}

function viewProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return `<p><a href="#projects">← Projects</a></p><p class="empty">Project not found.</p>`;
  const x = `data-id="${esc(p.id)}"`, crumbs = ancestors(p).map((a) => `<a href="#projects/${esc(a.id)}">${esc(a.name)}</a> / `).join("");
  const subs = state.projects.filter((s) => s.parent === id).sort((a, b) => (b.due || "").localeCompare(a.due || "") || a.name.localeCompare(b.name));
  const notes = state.notes.filter((n) => n.project === id).sort((a, b) => b.date.localeCompare(a.date));
  const links = projLinks(p), tracked = checkpoints(p).length > 0, n = p.due ? daysFrom(parse(p.due)) : null;
  const subRow = (s) => {
    const kids = state.projects.filter((q) => q.parent === s.id).length;
    return `<li><div class="row"><span><a href="#projects/${esc(s.id)}"><strong>${esc(s.name)}</strong></a> ${(s.assignees || []).map(personChip).join("")}</span><span class="muted">${s.due ? fmt(parse(s.due)) + " · " : ""}${kids ? kids + " sub · " : ""}${state.notes.filter((q) => q.project === s.id).length} notes · ${projLinks(s).length} links</span></div></li>`;
  };
  return `<p class="muted"><a href="#projects">Projects</a> / ${crumbs}${esc(p.name)}</p>
  <div class="row"><h1>${esc(p.name)}</h1><span>${p.due ? `<span class="due ${tracked ? cls(n) : ""}">${fmt(parse(p.due))}${tracked ? " · " + rel(n) : ""}</span> ` : ""}${officerBtn("Edit", "proj-edit", x)}</span></div>
  ${p.description ? `<p style="white-space:pre-wrap">${esc(p.description)}</p>` : ""}
  ${assignedLine(p)}
  <div class="grid cols-2" style="margin-top:12px">
   ${tracked ? `<div class="card"><h2>Checkpoints</h2><div class="bar"><i style="width:${progress(p)}%"></i></div>${cpRows(p)}</div>` : ""}
   <div class="card"><div class="row"><h2>Sub-projects</h2>${officerBtn("+ Sub-project", "proj-addsub", x)}</div>${subs.length ? `<ul class="list">${subs.map(subRow).join("")}</ul>` : `<p class="empty">None yet. For example, one for each general meeting or each part of an event.</p>`}</div>
   <div class="card"><div class="row"><h2>Links</h2>${officerBtn("+ Link", "proj-addlink", x)}</div>
    ${links.length ? `<ul class="list">${links.map((l) => `<li><div class="row"><a target="_blank" rel="noopener" href="${url(l.url)}">${esc(l.name)}</a>${state.officer ? `<button class="btn sm del" data-a="proj-rmlink" ${x} ${l.legacy ? `data-k="${l.legacy}"` : `data-i="${l.i}"`}>×</button>` : ""}</div></li>`).join("")}</ul>` : `<p class="empty">No links yet. Add the agenda, slides, a folder…</p>`}</div>
   <div class="card"><div class="row"><h2>Meeting notes</h2>${officerBtn("+ Notes", "proj-addnote", x)}</div>
    ${notes.length ? `<ul class="list">${notes.map(noteLi).join("")}</ul>` : `<p class="empty">No notes linked yet.</p>`}</div>
  </div>
  ${isSenior() ? `<p style="margin-top:16px"><button class="btn sm del" data-a="proj-del" ${x}>Delete this ${p.parent ? "sub-project" : "project"} and everything inside it</button></p>` : ""}`;
}

async function projAction(a, b) {
  const p = state.projects.find((x) => x.id === b.dataset.id);
  if (!p) return;
  try {
    if (a === "proj-addsub") openForm("New sub-project", projectFields({ owner: p.owner }), (v) => fb.addItem("projects", { ...v, parent: p.id, links: [], done: [] }));
    else if (a === "proj-edit") openForm("Edit project", projectFields(p, canDates(p)), (v) => fb.updateItem("projects", p.id, v));
    else if (a === "proj-addlink") openForm("Add a link", [{ name: "name", label: "Label", required: true, ph: "Agenda doc" }, { name: "url", label: "URL", type: "url", required: true }], (v) => fb.updateItem("projects", p.id, { links: [...(p.links || []), v] }));
    else if (a === "proj-addnote") openForm("Add meeting notes", noteFields({ project: p.id }), saveNote());
    else if (a === "proj-rmlink") {
      if (b.dataset.k) await fb.updateItem("projects", p.id, { [b.dataset.k]: "" });
      else await fb.updateItem("projects", p.id, { links: (p.links || []).filter((_, i) => i !== Number(b.dataset.i)) });
    } else if (a === "proj-del") {
      const kids = descendants(p.id);
      if (!confirm(`Delete "${p.name}"${kids.length ? ` and the ${kids.length} sub-project${kids.length === 1 ? "" : "s"} inside it` : ""}? Meeting-note links stay in the Notes tab.`)) return;
      for (const k of kids) await fb.removeItem("projects", k.id);
      await fb.removeItem("projects", p.id);
      location.hash = p.parent ? "#projects/" + p.parent : "#projects";
    }
  } catch (err) { alert("Could not update: " + err.message); }
}

let noteFilter = { q: "", team: "", project: "" };
function viewNotes() {
  const list = state.notes.filter((n) => (!noteFilter.team || n.team === noteFilter.team) && (!noteFilter.project || n.project === noteFilter.project) && n.title.toLowerCase().includes(noteFilter.q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  const groups = {};
  list.forEach((n) => { const k = parse(n.date).toLocaleDateString(undefined, { month: "long", year: "numeric" }); (groups[k] = groups[k] || []).push(n); });
  const sel = (id, opts, v, ph) => `<select id="${id}"><option value="">${ph}</option>${opts.map((o) => `<option value="${esc(o.value)}" ${o.value === v ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  return `<div class="row"><h1>Meeting notes</h1>${officerBtn("+ Add notes link", "addNote")}</div>
  <div class="tools"><input id="nq" placeholder="Search titles…" value="${esc(noteFilter.q)}">${sel("nt", teamOpts(true), noteFilter.team, "All teams")}${sel("np", state.projects.map((p) => ({ value: p.id, label: projName(p) })), noteFilter.project, "All projects")}</div>
  ${Object.entries(groups).map(([k, v]) => `<div class="card" style="margin-bottom:12px"><h2>${esc(k)}</h2><ul class="list">${v.map(noteLi).join("")}</ul></div>`).join("") || `<p class="empty">No matching notes.</p>`}`;
}

function viewCalendar() {
  if (!C.calendarId) return `<h1>Calendar</h1><p class="empty">Set <code>calendarId</code> in js/config.js to show your Google Calendar here.</p>`;
  const src = calSrc();
  return `<h1>Calendar</h1><iframe src="${src}" style="height:70vh" title="Calendar"></iframe>`;
}

function viewRequests() {
  return `<h1>Requests</h1><p class="muted">${esc(C.turnaround)}</p><div class="grid cols-2">${C.forms.map((f) => `<div class="card"><h2>${esc(f.name)}</h2><p>${esc(f.desc)}</p><a class="btn pri" target="_blank" rel="noopener" href="${url(f.url)}">Open form</a>${f.embed ? `<iframe src="${url(f.embed)}" style="height:520px;margin-top:12px" title="${esc(f.name)}"></iframe>` : ""}</div>`).join("")}</div>`;
}

const noteFields = (v = {}) => [{ name: "title", label: "Title", required: true, ph: "Media sync", value: v.title }, { name: "date", label: "Meeting date", type: "date", required: true, value: v.date }, { name: "team", label: "Team", type: "select", options: teamOpts(true), value: v.team }, { name: "project", label: "Project (optional)", type: "select", value: v.project, options: [{ value: "", label: "—" }, ...state.projects.map((p) => ({ value: p.id, label: projName(p) }))] }, { name: "url", label: "Notes link (Google Doc). Optional if you add slides.", type: "url", value: v.url }, { name: "slides", label: "Slides link (Canva, Google Slides…). Optional if you add notes.", type: "url", value: v.slides }, { name: "share", label: "Who can see this", type: "select", value: shareOf(v), options: [{ value: "officers", label: "Officers only" }, { value: "slides", label: "Members can see the slides link only" }, { value: "all", label: "Members can see the notes and slides links" }] }];

// ---------- Meeting notes: who can see what ----------
// Each note has a "share" setting: "officers" (only officers), "slides" (members see the slides link only), or "all"
// (members see the notes and slides links). Older notes tagged public count as "all".
// Members never read the notes themselves. They read publicNotes, a copy holding only what an officer chose to share.
const shareOf = (n) => n.share || (n.public ? "all" : "officers");
const SHARE_LABEL = { officers: ["officers only", "#555"], slides: ["members: slides", "#8b2a33"], all: ["members: notes + slides", "#2f6b4f"] };
const shareChip = (n) => { const [t, c] = SHARE_LABEL[shareOf(n)]; return ` <span class="chip" style="--c:${c}">${t}</span>`; };
const mirrorOf = (n) => {
  const s = shareOf(n), url = s === "all" ? n.url || "" : "", slides = s === "officers" ? "" : n.slides || "";
  return url || slides ? { title: n.title, date: n.date, team: n.team || "all", url, slides } : null;
};
const mirror = (id, n) => { const want = mirrorOf(n); return want ? fb.setItem("publicNotes", id, want) : fb.removeItem("publicNotes", id); };
// Runs once per officer visit: makes the member copies match the notes (covers notes made before this existed).
async function syncMirrors() {
  const same = (a, b) => ["title", "date", "team", "url", "slides"].every((k) => (a[k] || "") === (b[k] || ""));
  for (const n of state.notes) {
    const want = mirrorOf(n), have = state.publicNotes.find((p) => p.id === n.id);
    if (!want && have) await fb.removeItem("publicNotes", n.id);
    else if (want && (!have || !same(have, want))) await fb.setItem("publicNotes", n.id, want);
  }
  for (const p of state.publicNotes) if (!state.notes.some((n) => n.id === p.id)) await fb.removeItem("publicNotes", p.id);
}
// Saves a meeting note. It needs a notes link or a slides link, at least one.
const saveNote = (id) => async (v) => {
  if (!v.url && !v.slides) throw new Error("Add a notes link or a slides link.");
  if (id) await fb.updateItem("notes", id, v); else id = (await fb.addItem("notes", v)).id;
  await mirror(id, v);
};
const pubNoteLi = (n) => `<li><div class="row"><span><a target="_blank" rel="noopener" href="${url(n.url || n.slides)}"><strong>${esc(n.title)}</strong></a>${n.url && n.slides ? ` <a class="btn sm" target="_blank" rel="noopener" href="${url(n.slides)}">Slides</a>` : ""} ${chip(n.team)}</span><span class="muted">${fmt(parse(n.date))}</span></div></li>`;

// ---------- Google Drive ----------
const drv = { stack: [{ id: drive.rootId(), name: drive.rootName() }], files: [], q: "", loading: false, error: "", need: true };
const ICON = { [drive.FOLDER]: "📁", [drive.TYPES.doc]: "📄", [drive.TYPES.sheet]: "📊", [drive.TYPES.slides]: "📽️", "application/vnd.google-apps.form": "📝", "application/pdf": "📕" };
async function loadDrive(show = true) {
  drv.loading = true; drv.error = "";
  if (show) render();
  try { drv.files = await drive.list(drv.stack[drv.stack.length - 1].id, drv.q); }
  catch (e) { drv.error = e.message === "expired" ? "Your Drive connection expired. Please reconnect." : e.message; drv.files = []; }
  drv.loading = false; render();
}
function viewDrive() {
  if (C.driveMode !== "oauth" && fb.configured) {
    const id = C.driveRootId;
    return `<h1>Drive</h1>` + (id ? `<p class="muted">Shows the files your own Google account can access. <a target="_blank" rel="noopener" href="https://drive.google.com/drive/folders/${esc(id)}">Open in Drive</a></p><iframe src="https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}#list" style="height:70vh" title="Drive folder"></iframe>` : `<p class="empty">Set <code>driveRootId</code> in js/config.js to show your Drive folder here.</p>`);
  }
  if (!drive.connected()) return `<h1>Drive</h1><div class="card"><p>Connect Google Drive to browse and manage the org's shared files here. You'll only see and change what your own Google account already has access to.</p><button class="btn pri" data-a="drv-connect">Connect Google Drive</button><p class="muted">Google will ask for permission. You can revoke it anytime at myaccount.google.com/permissions.</p></div>`;
  const crumbs = drv.stack.map((s, i) => `<a href="#drive" data-a="drv-crumb" data-i="${i}">${esc(s.name)}</a>`).join(" / ");
  const rows = drv.files.map((f) => {
    const isF = f.mimeType === drive.FOLDER, n = esc(f.name);
    return `<li><div class="row"><span>${ICON[f.mimeType] || "📎"} ${isF ? `<a href="#drive" data-a="drv-open" data-id="${esc(f.id)}" data-n="${n}"><strong>${n}</strong></a>` : `<a target="_blank" rel="noopener" href="${url(f.webViewLink)}"><strong>${n}</strong></a>`}
      <span class="muted">${f.modifiedTime ? fmt(new Date(f.modifiedTime)) : ""}</span></span>
      <span>${isF ? "" : `<button class="btn sm" data-a="drv-prev" data-l="${esc(f.webViewLink)}">Preview</button> `}${!isF && state.officer && f.mimeType === drive.TYPES.doc ? `<button class="btn sm" data-a="drv-note" data-n="${n}" data-l="${esc(f.webViewLink)}">Log as meeting note</button> ` : ""}<button class="btn sm" data-a="drv-rename" data-id="${esc(f.id)}" data-n="${n}">Rename</button> <button class="btn sm del" data-a="drv-trash" data-id="${esc(f.id)}">Trash</button></span></div></li>`;
  }).join("");
  return `<div class="row"><h1>Drive</h1><span class="muted">Opens in Google Docs/Sheets to edit</span></div>
  <p>${crumbs}</p>
  <div class="tools"><input id="dq" placeholder="Search this folder (press Enter)…" value="${esc(drv.q)}">
    ${["doc", "sheet", "slides", "folder"].map((t) => `<button class="btn sm" data-a="drv-new" data-t="${t}">+ ${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
    <button class="btn sm" data-a="drv-refresh">Refresh</button></div>
  ${drv.error ? `<div class="banner">${esc(drv.error)} <button class="btn sm" data-a="drv-connect">Reconnect</button></div>` : ""}
  <div class="card">${drv.loading ? `<p class="empty">Loading…</p>` : rows ? `<ul class="list">${rows}</ul>` : `<p class="empty">This folder is empty.</p>`}</div>`;
}
async function driveAction(a, b) {
  const top = drv.stack[drv.stack.length - 1];
  try {
    if (a === "drv-connect") { await drive.connect(); drv.need = true; render(); }
    else if (a === "drv-open") { drv.stack.push({ id: b.dataset.id, name: b.dataset.n }); drv.q = ""; await loadDrive(); }
    else if (a === "drv-crumb") { drv.stack = drv.stack.slice(0, Number(b.dataset.i) + 1); drv.q = ""; await loadDrive(); }
    else if (a === "drv-refresh") await loadDrive();
    else if (a === "drv-new") {
      const t = b.dataset.t, name = prompt("Name for the new " + t + ":"); if (!name?.trim()) return;
      await drive.create(name.trim(), drive.TYPES[t], top.id); await loadDrive();
    } else if (a === "drv-rename") {
      const name = prompt("New name:", b.dataset.n); if (!name?.trim() || name === b.dataset.n) return;
      await drive.rename(b.dataset.id, name.trim()); await loadDrive();
    } else if (a === "drv-trash") {
      if (!confirm("Move this to the Drive trash? You can restore it from Drive for 30 days.")) return;
      await drive.trash(b.dataset.id); await loadDrive();
    } else if (a === "drv-prev") {
      const link = b.dataset.l, pv = link.replace(/\/(edit|view)(\?.*)?$/, "/preview");
      $("#dform").onsubmit = null;
      $("#dform").innerHTML = `<div class="row"><h2>Preview</h2><span><a class="btn sm" target="_blank" rel="noopener" href="${url(link)}">Open in Google</a> <button type="button" class="btn sm" id="cancel">Close</button></span></div><iframe src="${url(pv)}" style="height:60vh;margin-top:10px" title="Preview"></iframe>`;
      $("#cancel").onclick = () => $("#dlg").close(); $("#dlg").style.maxWidth = "900px"; $("#dlg").showModal();
    } else if (a === "drv-note") {
      $("#dlg").style.maxWidth = "";
      openForm("Add meeting notes", noteFields({ title: b.dataset.n, url: b.dataset.l, date: new Date().toISOString().slice(0, 10) }), saveNote());
    }
  } catch (err) { drv.loading = false; drv.error = err.message === "expired" ? "Your Drive connection expired. Please reconnect." : err.message; render(); }
}

// ---------- People (officers approve members) ----------
// One entry per person, even if their email is saved in different capitals or with a stray space.
// When there are several records for one person, the one that has a name wins over an email-only one.
const key = (id) => id.trim().toLowerCase();
const dedupe = (list) => {
  const best = new Map();
  for (const d of list) { const k = key(d.id), cur = best.get(k); if (!cur || (!cur.name && d.name)) best.set(k, d); }
  return [...best.values()];
};
function rebuildDir() {
  const names = new Map([...state.members, ...state.officers].filter((d) => d.name).map((d) => [key(d.id), d.name]));
  state.users = dedupe(state.officers).map((d) => ({ email: key(d.id), name: d.name || names.get(key(d.id)) || d.id }));
}
// "Jane Doe jane@utexas.edu", "jane@utexas.edu" or "Jane <jane@utexas.edu>", one per line. Returns valid people and the lines it couldn't read.
// ---------- Officer levels ----------
// Senior officers have full access. Junior officers can do only what the senior officers of their team allow
// (set on the team's page). The officer titled "President" decides everyone's title, level and team, and who is an officer.
// No level set = senior, so officers from before levels existed keep full access. (The database rules enforce all of this.)
const DEFAULT_TITLES = ["President", "Vice President", "Treasurer", "Secretary", "Director", "Associate"];
const titles = () => { const t = C.officerTitles?.length ? C.officerTitles : DEFAULT_TITLES; return t.includes("President") ? t : ["President", ...t]; };
const myOfficer = () => state.officers.find((o) => key(o.id) === me());
const isPresident = () => state.officer && myOfficer()?.title === "President";
const isSenior = () => state.officer && (isPresident() || myOfficer()?.level !== "junior");
const isJunior = () => state.officer && !isSenior();
const myTeam = () => myOfficer()?.team || "";
const manages = (team) => isPresident() || (isSenior() && (myTeam() === "" || myTeam() === team)); // president, or a senior officer of this team (or of no single team)
const juniorCan = (perm, team) => isJunior() && !!team && myTeam() === team && !!state.teamPerms[team]?.[perm];
const canDates = (p) => isSenior() || juniorCan("editProjects", p.owner); // edit a project's dates and checkpoints
const canRoster = (team) => manages(team) || juniorCan("manageTeam", team); // add officers to a team

const LEVELS = [{ value: "senior", label: "Senior officer (full access)" }, { value: "junior", label: "Junior officer (only what their team's senior officers allow)" }];
const teamSelectOpts = () => [{ value: "", label: "Whole organization (no single team)" }, ...C.teams.map((t) => ({ value: t.id, label: t.name }))];
const titleOpts = (cur) => [{ value: "", label: "(no role)" }, ...[...new Set([...titles(), ...(cur ? [cur] : [])])].map((t) => ({ value: t, label: t }))];
const officerFields = (o = {}, isSelf = false, defLevel = "senior") => [
  { name: "title", label: "Role", type: "select", value: o.title || "", options: titleOpts(o.title) },
  ...(isSelf ? [] : [{ name: "level", label: "Level", type: "select", value: o.level || defLevel, options: LEVELS }]),
  { name: "team", label: "Team / department", type: "select", value: o.team || "", options: teamSelectOpts() },
];

// "Jane Doe jane@utexas.edu", "jane@utexas.edu" or "Jane <jane@utexas.edu>", one per line. Returns valid people and the lines it couldn't read.
const parsePeople = (text) => {
  const ok = [], bad = [];
  for (const line of text.split(/[\n;]+/)) {
    if (!line.trim()) continue;
    const m = line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/);
    if (!m) { bad.push(line.trim()); continue; }
    const email = m[0].toLowerCase();
    ok.push({ email, name: line.replace(m[0], "").replace(/[<>,"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || email.split("@")[0] });
  }
  return { ok, bad };
};
const SENIOR_WARNING = "A senior officer can edit almost everything, approve people, and see the text-alert phone list. Make them a senior officer?";

function viewPeople() {
  if (!isSenior()) return `<p class="empty">Senior officers only.</p>`;
  const pres = isPresident();
  const uniq = dedupe; // same email in different capitals = one person
  const offs = uniq(state.officers), mems = uniq(state.members);
  const have = new Set([...offs, ...mems].map((d) => key(d.id))), offIds = new Set(offs.map((o) => key(o.id)));
  const names = new Map([...mems, ...offs].filter((d) => d.name).map((d) => [key(d.id), d.name])); // so an email-only record can borrow the person's name
  const pending = uniq(state.signups).filter((u) => !have.has(key(u.id))).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const members = mems.filter((m) => !offIds.has(key(m.id))).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const who = (d, n) => `<span><strong>${esc(n || d.name || d.id)}</strong><div class="muted">${esc(d.id)}</div></span>`;
  const src = (o) => o.source === "slack" ? ' <span class="chip" style="--c:#10204a">via Slack</span>' : o.source === "hub" ? ' <span class="chip" style="--c:#2f6b4f">added here</span>' : ' <span class="chip" style="--c:#555">set in Firebase</span>';
  const sel = (o, f, opts, v, dis) => `<select data-off="${esc(o.id)}" data-f="${f}" ${dis ? "disabled" : ""} aria-label="${f}" style="width:auto;padding:4px 8px;font-size:.85rem">${opts.map((x) => `<option value="${esc(x.value)}" ${x.value === v ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select>`;
  const lv = (o) => (o.level === "junior" ? "junior" : "senior");
  const offRow = (o) => {
    const self = key(o.id) === me(), label = o.name || names.get(key(o.id)) || o.id;
    // Only the president gets dropdowns. Everyone else sees the same information as plain labels.
    const controls = pres
      ? `<span style="display:flex;gap:6px;flex-wrap:wrap">${sel(o, "title", titleOpts(o.title), o.title || "", false)}${sel(o, "level", [{ value: "senior", label: "Senior" }, { value: "junior", label: "Junior" }], lv(o), self)}${sel(o, "team", teamSelectOpts().map((x) => ({ ...x, label: x.value ? x.label : "Whole org" })), o.team || "", false)}</span>`
      : `<span>${o.title ? `<span class="chip" style="--c:#555">${esc(o.title)}</span>` : ""}<span class="chip" style="--c:${lv(o) === "junior" ? "#8b2a33" : "#10204a"}">${lv(o)}</span>${o.team ? chip(o.team) : ""}</span>`;
    const btns = pres && !self ? `<span><button class="btn sm" data-a="ppl-demote" data-id="${esc(o.id)}" data-n="${esc(label)}">Make member</button> <button class="btn sm del" data-a="ppl-rm-officer" data-id="${esc(o.id)}">Remove</button></span>` : "";
    return `<li><div class="row"><span><strong>${esc(label)}</strong>${src(o)}<div class="muted">${esc(o.id)}</div></span>${controls}${btns}</div></li>`;
  };
  const blockedCard = pres ? `<div class="card"><h2>Removed from Slack sync <span class="badge">${state.blocked.length}</span></h2><p class="muted">Officers you removed who are still in Slack. They won't be added back automatically.</p>${state.blocked.length ? `<ul class="list">${state.blocked.map((x) => `<li><div class="row"><span><strong>${esc(x.name || x.id)}</strong><div class="muted">${esc(x.id)}</div></span><button class="btn sm" data-a="ppl-unblock" data-id="${esc(x.id)}">Allow again</button></div></li>`).join("")}</ul>` : `<p class="empty">No one.</p>`}</div>` : "";
  const noPres = !offs.some((o) => o.title === "President");
  return `<div class="row"><h1>People</h1><span>${pres ? officerBtn("+ Add officers", "ppl-add", 'data-role="officer"') : ""} ${officerBtn("+ Add members", "ppl-add", 'data-role="member"')}</span></div>
  ${noPres ? `<div class="banner">No one has the <strong>President</strong> role yet. Until someone does, nobody can add or remove officers or change their role, level or team. Once, in the Firebase console, open Firestore &gt; <code>officers</code> &gt; the president's email &gt; add a field <code>title</code> with the text <code>President</code>. After that it all happens here.</div>` : ""}
  <p class="muted">Add people by email so they skip the waiting line, or approve people who signed in on their own. <strong>Members</strong> see the member home page, calendar and profile. <strong>Officers</strong> see everything, and only the <strong>President</strong> can add officers or change an officer's role, level or team.</p>
  <div class="grid cols-2">
   <div class="card"><h2>Waiting for approval <span class="badge">${pending.length}</span></h2>
    ${pending.length ? `<ul class="list">${pending.map((u) => `<li><div class="row">${who(u)}<span><button class="btn pri sm" data-a="ppl-approve" data-id="${esc(u.id)}" data-n="${esc(u.name || "")}">Member</button> ${pres ? `<button class="btn sm" data-a="ppl-approve-officer" data-id="${esc(u.id)}" data-n="${esc(u.name || "")}">Officer</button> ` : ""}<button class="btn sm del" data-a="ppl-decline" data-id="${esc(u.id)}">Decline</button></span></div></li>`).join("")}</ul>` : `<p class="empty">No one is waiting.</p>`}
    <p class="muted">Decline just clears the request. They'll reappear if they sign in again.</p></div>
   <div class="card"><h2>Members <span class="badge">${members.length}</span></h2>
    ${members.length ? `<ul class="list">${members.map((m) => `<li><div class="row">${who(m)}<span>${pres ? `<button class="btn sm" data-a="ppl-promote" data-id="${esc(m.id)}" data-n="${esc(m.name || "")}">Make officer</button> ` : ""}<button class="btn sm del" data-a="ppl-remove" data-id="${esc(m.id)}">Remove</button></span></div></li>`).join("")}</ul>` : `<p class="empty">No members yet.</p>`}</div>
   ${smsListCard()}
   <div class="card"><h2>Officers <span class="badge">${offs.length}</span></h2><ul class="list">${offs.map(offRow).join("")}</ul>
    <p class="muted">Senior officers have full access. Junior officers can do only what their team's senior officers allow (set on the team's page). New officers from Slack start as junior. ${pres ? "You're the President, so you can change all of this." : "Only the President can change these."}</p></div>
   ${blockedCard}
  </div>`;
}
async function peopleAction(a, b) {
  const id = b.dataset.id, name = (b.dataset.n || id || "").slice(0, 40), by = me();
  const addMember = (e, n) => fb.setItem("members", e, { email: e, name: n, approvedBy: by });
  const addOfficer = (e, n, x = {}) => fb.setItem("officers", e, { name: n, source: "hub", addedBy: by, title: x.title || "", level: x.level || "junior", team: x.team || "" });
  const found = (e) => state.officers.find((x) => key(x.id) === key(e));
  // Removing someone who came from Slack would be undone the next time they sign in, so the president's removal is remembered.
  const blockIfSlack = async (e) => { const o = found(e); if (o?.source === "slack") await fb.setItem("blockedOfficers", key(e), { by, name: o.name || e }); };
  try {
    if (a === "ppl-approve") await addMember(id, name);
    else if (a === "ppl-approve-officer" || a === "ppl-promote") openForm("Make an officer", officerFields({}, false, "junior"), async (v) => {
      if (v.level === "senior" && !confirm(SENIOR_WARNING)) return;
      await addOfficer(id, name, v);
      if (a === "ppl-promote") await fb.removeItem("members", id);
    });
    else if (a === "ppl-demote") { if (confirm("Make this person a regular member? They'll lose officer access.")) { await blockIfSlack(id); await addMember(id, name); await fb.removeItem("officers", id); } }
    else if (a === "ppl-rm-officer") {
      const fromSlack = found(id)?.source === "slack";
      if (confirm("Remove this officer? They lose all access." + (fromSlack ? " They came from Slack, so they also won't be added back automatically. You can undo that under Removed from Slack sync." : ""))) { await blockIfSlack(id); await fb.removeItem("officers", id); }
    }
    else if (a === "ppl-unblock") await fb.removeItem("blockedOfficers", id);
    else if (a === "ppl-decline") { if (confirm("Clear this request?")) await fb.removeItem("users", id); }
    else if (a === "ppl-remove") { if (confirm("Remove this member? They'll lose access until approved again.")) await fb.removeItem("members", id); }
    else if (a === "ppl-add") {
      const role = b.dataset.role === "officer" ? "officer" : "member";
      openForm(role === "officer" ? "Add officers" : "Add members", [
        { name: "people", label: "Emails, one per line. Put a name before the email if you like (Jane Doe jane@utexas.edu).", type: "textarea", rows: 8 },
        ...(role === "officer" ? officerFields({}, false, "junior") : []),
      ], async (v) => {
        const { ok, bad } = parsePeople(v.people);
        if (!ok.length) throw new Error("No email addresses found.");
        if (role === "officer" && v.level === "senior" && !confirm(SENIOR_WARNING.replace("them a senior officer", "everyone on this list a senior officer"))) return;
        const isO = new Set(state.officers.map((o) => key(o.id))), isM = new Set(state.members.map((m) => key(m.id))), skipped = [];
        let added = 0;
        for (const p of ok) {
          if (role === "officer" ? isO.has(p.email) : isO.has(p.email) || isM.has(p.email)) { skipped.push(p.email); continue; } // never overwrite someone's existing record or nickname
          if (role === "officer") await addOfficer(p.email, p.name, v); else await addMember(p.email, p.name);
          added++;
        }
        alert(`Added ${added}.` + (skipped.length ? `\nAlready here, left alone: ${skipped.join(", ")}.` : "") + (bad.length ? `\nCouldn't read: ${bad.join("; ")}.` : "") + "\nThey can sign in with that Google email and go straight in.");
      });
    }
  } catch (err) { alert("Could not update: " + err.message); }
}

// ---------- Teams: who's on the team, and what its junior officers are allowed to do ----------
function teamRosterCards(t) {
  if (!state.officer) return "";
  const roster = dedupe(state.officers).filter((o) => (o.team || "") === t.id), mine = canRoster(t.id), perms = state.teamPerms[t.id] || {};
  const tag = (o) => `${o.title ? `<span class="chip" style="--c:#555">${esc(o.title)}</span>` : ""}<span class="chip" style="--c:${o.level === "junior" ? "#8b2a33" : "#10204a"}">${o.level === "junior" ? "junior" : "senior"}</span>`;
  return `<div class="card"><div class="row"><h2>Team officers</h2>${mine ? `<button class="btn pri sm" data-a="team-add" data-team="${esc(t.id)}">+ Add officer</button>` : ""}</div>
    ${roster.length ? `<ul class="list">${roster.map((o) => `<li><div class="row"><span><strong>${esc(o.name || o.id)}</strong> ${tag(o)}</span>${mine ? `<button class="btn sm del" data-a="team-rm" data-team="${esc(t.id)}" data-id="${esc(o.id)}">Remove</button>` : ""}</div></li>`).join("")}</ul>` : `<p class="empty">No officers on this team yet.</p>`}</div>
  ${manages(t.id) ? `<div class="card"><div class="row"><h2>Junior officer permissions</h2><button class="btn sm" data-a="team-perms" data-team="${esc(t.id)}">Edit</button></div><p class="muted">Junior officers on ${esc(t.name)} can do only what you allow here.</p><ul class="list"><li>${perms.editProjects ? "✅" : "⬜"} Edit the dates and checkpoints of projects that ${esc(t.name)} owns</li><li>${perms.manageTeam ? "✅" : "⬜"} Add officers to the team and remove them</li></ul></div>` : ""}`;
}
async function teamAction(a, b) {
  const team = b.dataset.team, id = b.dataset.id;
  try {
    if (a === "team-add") {
      // A junior officer can only pick up officers who are on no team yet. Senior officers can move anyone.
      const cand = dedupe(state.officers).filter((o) => (o.team || "") !== team && (isJunior() ? !o.team : true));
      if (!cand.length) { alert("There's no one to add."); return; }
      openForm("Add an officer to this team", [{ name: "who", label: "Officer", type: "select", options: cand.map((o) => ({ value: o.id, label: (o.name || o.id) + (o.team ? ` (now on ${C.teams.find((x) => x.id === o.team)?.name || o.team})` : "") })) }], (v) => fb.updateItem("officers", v.who, { team }));
    } else if (a === "team-rm") { if (confirm("Take this officer off the team?")) await fb.updateItem("officers", id, { team: "" }); }
    else if (a === "team-perms") {
      const p = state.teamPerms[team] || {};
      openForm("Junior officer permissions", [
        { name: "editProjects", label: "Edit the dates and checkpoints of this team's projects", type: "check", value: !!p.editProjects },
        { name: "manageTeam", label: "Add officers to the team and remove them", type: "check", value: !!p.manageTeam },
      ], (v) => fb.setItem("teamPerms", team, v));
    }
  } catch (err) { alert("Could not update: " + err.message); }
}

// ---------- Text alerts (consent capture + officer export) ----------
// ---------- Nickname: the name other members see ----------
const myName = () => state.nick || state.user.displayName || me();
const nickInner = () => `<h2>Your nickname</h2><p class="muted">This is the name other members see. You can change it any time under Profile.</p>
  <form id="nickform" class="row" style="flex-wrap:nowrap"><input name="nick" required maxlength="40" placeholder="Nickname" value="${esc(state.nick)}"><button class="btn pri">Save</button></form>
  ${state.nick ? `<p class="muted">Currently shown as <strong>${esc(state.nick)}</strong>.</p>` : ""}`;
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "nickform") return;
  e.preventDefault();
  const name = e.target.elements.nick.value.trim().slice(0, 40);
  if (!name) return;
  try {
    await fb.updateItem("users", me(), { name });
    // keep the member directory and text-alert record in step; a failure here doesn't undo the nickname
    const extra = [];
    if (!state.pending) extra.push(fb.updateItem(state.officer ? "officers" : "members", me(), { name }));
    if (state.sms) extra.push(fb.updateItem("smsConsent", me(), { name }));
    await Promise.allSettled(extra);
    state.nick = name;
    if (state.pending) $("#nickcard").innerHTML = nickInner(); else render();
  } catch (err) { alert("Could not save: " + err.message); }
});

const normPhone = (s) => { const d = String(s).replace(/\D/g, ""); return d.length === 10 ? "+1" + d : d.length === 11 && d[0] === "1" ? "+" + d : null; };
const disclosure = () => C.sms.disclosure.replace("{org}", C.orgName);
function smsInner() {
  if (!C.sms?.enabled) return "";
  const s = state.sms;
  if (s && s.consent) return `<h2>Text alerts: on</h2><p>We'll text <strong>${esc(s.phone)}</strong>. You agreed on ${new Date(s.consentedAt).toLocaleDateString()}.</p><button class="btn sm del" data-a="sms-stop">Turn off text alerts</button>`;
  return `<h2>Text alerts <span class="muted">(optional)</span></h2>${s && s.optedOutAt ? `<p class="muted">Text alerts are currently off.</p>` : ""}
  <form id="smsform"><label>Mobile number (US)<input name="phone" type="tel" placeholder="(512) 555-0123" required value="${esc(s?.phone || "")}"></label>
  <label class="inline" style="align-items:flex-start;margin-top:10px"><input type="checkbox" name="agree" required style="margin-top:4px"><span>${esc(disclosure())}</span></label>
  <button class="btn pri" style="margin-top:10px">Sign up for texts</button></form>`;
}
const refreshSms = () => { if (state.pending) $("#smscard").innerHTML = smsInner(); else render(); };
function viewProfile() {
  return `<h1>Profile</h1><div class="card"><strong>${esc(myName())}</strong><div class="muted">${esc(state.user.email)} · ${state.officer ? "officer" : "member"}</div></div>
  <div class="card" style="margin-top:16px">${nickInner()}</div>
  ${C.sms?.enabled ? `<div class="card" id="smscard" style="margin-top:16px">${smsInner()}</div>` : ""}`;
}
// Only approved people count: anyone can type someone else's number, and nothing here can prove who owns it.
const optIns = () => {
  const ok = new Set([...state.members, ...state.officers].map((d) => key(d.id)));
  return state.smsList.filter((x) => x.consent && ok.has(key(x.id))).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
};
function smsListCard() {
  if (!C.sms?.enabled) return "";
  const on = optIns();
  return `<div class="card"><h2>Text alerts list <span class="badge">${on.length}</span></h2>
  <p class="muted">Approved people who ticked the opt-in box, each with a saved record of when and what they agreed to. We can't check who owns a number, so have your texting service send a confirmation text ("Reply YES") before the first real message.</p>
  ${on.length ? `<ul class="list" style="max-height:260px;overflow:auto">${on.map((x) => `<li><div class="row"><span><strong>${esc(x.name || x.id)}</strong> <span class="muted">${esc(x.phone)}</span></span><button class="btn sm del" data-a="sms-optout" data-id="${esc(x.id)}">Mark STOP</button></div></li>`).join("")}</ul>` : `<p class="empty">No one has opted in yet.</p>`}
  <button class="btn sm" data-a="sms-csv">Download CSV</button> <button class="btn sm" data-a="sms-copy">Copy numbers</button>
  <p class="muted">This site can't send texts itself. Upload the list to your texting service. If someone replies STOP, click "Mark STOP" here too so they drop off the list.</p></div>`;
}
async function smsAction(a, b) {
  try {
    const stamp = new Date().toISOString();
    if (a === "sms-stop") { if (!confirm("Turn off text alerts?")) return; await fb.updateItem("smsConsent", me(), { consent: false, optedOutAt: stamp }); state.sms = { ...state.sms, consent: false, optedOutAt: stamp }; refreshSms(); }
    else if (a === "sms-optout") { if (confirm("Mark this person as opted out of texts?")) await fb.updateItem("smsConsent", b.dataset.id, { consent: false, optedOutAt: stamp }); }
    else {
      const on = optIns();
      if (a === "sms-copy") { await navigator.clipboard.writeText(on.map((x) => x.phone).join("\n")); alert(on.length + " numbers copied."); }
      if (a === "sms-csv") {
        const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
        const csv = "name,email,phone,consented_at\n" + on.map((x) => [x.name, x.email, x.phone, x.consentedAt].map(q).join(",")).join("\n");
        const el = document.createElement("a"); el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); el.download = "text-alerts-optins.csv"; el.click();
      }
    }
  } catch (err) { alert("Could not update: " + err.message); }
}
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "smsform") return;
  e.preventDefault();
  const phone = normPhone(e.target.elements.phone.value);
  if (!phone) { alert("Enter a valid 10-digit US mobile number."); return; }
  if (!e.target.elements.agree.checked) return;
  const data = { email: me(), name: myName(), phone, consent: true, disclosure: disclosure(), consentedAt: new Date().toISOString() };
  try { await fb.setItem("smsConsent", me(), data); state.sms = { id: me(), ...data }; refreshSms(); } catch (err) { alert("Could not save: " + err.message); }
});

// ---------- Start here (officers can edit the text; Slack channel topics fill in "which channel does what") ----------
const DEFAULT_START = `## Welcome to {org}
This is the officer hub. Plans, decisions and links live here so nothing gets lost in chat.

## The tools and what each is for
- Slack: day-to-day chat. Anything that has to be found later goes in the hub.
- This hub: projects and assignments, meeting notes, requests and forms, announcements, links.
- Google Drive: our shared files (Drive tab).
- Google Calendar: meetings and deadlines (Calendar tab).
- Google Forms: media requests, event proposals and reimbursements (Requests tab).

## Where to put things
- A new event or task: make a project (Projects tab), add sub-projects for its parts, and assign teams and people.
- Meeting notes: write them in a Google Doc, then add the link under Meeting notes.
- Something everyone should see: post an announcement on Home. It can post to Slack too.

## Who to ask
- Hub or website problems: [add a name]
- Media requests: [add a name]
- Reimbursements and budget: [add a name]
- Event proposals: [add a name]
- Anything else: [add a name]`;
const startBody = () => state.pages.find((p) => p.id === "start")?.body ?? DEFAULT_START.replace("{org}", C.orgName);
// Tiny formatter: "## " heading, "- " bullet, links. Everything is escaped first.
const rich = (t) => esc(t).split("\n").map((l) => l.startsWith("## ") ? `<h3 style="margin-top:14px">${l.slice(3)}</h3>` : l.startsWith("- ") ? `<p style="margin:4px 0">• ${l.slice(2)}</p>` : l.trim() ? `<p>${l}</p>` : "").join("").replace(/(https?:\/\/[^\s<]+)/g, '<a target="_blank" rel="noopener" href="$1">$1</a>');
function viewStart() {
  const chans = state.officer ? (state.slack?.channels || []).filter((c) => c.topic) : [];
  return `<div class="row"><h1>Start here</h1>${officerBtn("Edit this page", "startEdit")}</div>
  <div class="card">${rich(startBody())}</div>
  ${state.officer ? `<div class="card" style="margin-top:16px"><h2>Slack channels and what they're for</h2>${state.slackErr ? `<p class="muted">${esc(state.slackErr)}</p>` : chans.length ? `<ul class="list">${chans.map(chanRow).join("")}</ul>` : `<p class="empty">${state.slack === null ? "Loading…" : "No channel descriptions yet. Add a topic or description to a Slack channel and it shows up here."}</p>`}</div>` : ""}`;
}

// ---------- Slack channels (auto-updating) ----------
let slackQ = "";
async function loadSlack() {
  if (fb.configured && !C.slack?.endpoint) { state.slack = { team: "", channels: [] }; return; }
  state.slackLoading = true;
  try {
    if (!fb.configured) state.slack = { team: "T0", channels: [{ id: "C1", name: "media", topic: "Photo, video, graphics", members: 12 }, { id: "C2", name: "finance", topic: "Budget and reimbursements", members: 6 }, { id: "C3", name: "events-fall-showcase", topic: "Planning the showcase", members: 18 }, { id: "C4", name: "general", topic: "", members: 80 }, { id: "C5", name: "officers-planning", topic: "Private officer planning", members: 7, private: true }] };
    else {
      const r = await fetch(C.slack.endpoint, { headers: { Authorization: "Bearer " + (await fb.idToken()) } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error " + r.status);
      state.slack = await r.json();
    }
    state.slackErr = "";
  } catch (e) { state.slack = { team: "", channels: [] }; state.slackErr = e.message; }
  state.slackLoading = false; render();
}
// Sends a hub announcement to Slack through the Worker. The hub copy is already saved by the time this runs.
async function postToSlack(a) {
  if (!fb.configured) return; // demo mode
  const r = await fetch(C.slack.endpoint.replace(/\/$/, "") + "/announce", { method: "POST", headers: { Authorization: "Bearer " + (await fb.idToken()), "Content-Type": "application/json" }, body: JSON.stringify({ title: a.title, body: a.body }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error " + r.status);
}
const chanUrl = (c) => `https://slack.com/app_redirect?team=${encodeURIComponent(state.slack.team)}&channel=${encodeURIComponent(c.id)}`;
const chanRow = (c) => `<li><div class="row"><span><a target="_blank" rel="noopener" href="${chanUrl(c)}"><strong>${c.private ? "🔒 " : "#"}${esc(c.name)}</strong></a> <span class="muted">${c.members} members</span>${c.topic ? `<div class="muted">${esc(c.topic)}</div>` : ""}</span></div></li>`;
function teamChannels(t) {
  if (!state.officer) return "";
  const ch = (state.slack?.channels || []).filter((c) => c.name.includes(t.id) || c.name.includes(t.name.toLowerCase()));
  if (!state.slack || (!ch.length && !state.slackErr)) return "";
  return `<div class="card"><h2>Slack channels</h2><ul class="list">${ch.map(chanRow).join("")}</ul></div>`;
}
function viewSlack() {
  if (!state.officer) return `<h1>Slack channels</h1><p class="empty">Channels are for officers only.</p>`;
  const all = state.slack?.channels || [], q = slackQ.toLowerCase();
  const list = all.filter((c) => !q || c.name.includes(q) || c.topic.toLowerCase().includes(q));
  return `<h1>Slack channels</h1><p class="muted">Updates automatically when channels are created or archived. Shows public channels plus the private channels you're in. 🔒 marks a private channel.</p>
  <div class="tools"><input id="sq" placeholder="Search channels…" value="${esc(slackQ)}"></div>
  ${state.slackErr ? `<div class="banner">${esc(state.slackErr)}</div>` : ""}
  <div class="card">${state.slack === null || state.slackLoading ? `<p class="empty">Loading…</p>` : list.length ? `<ul class="list">${list.map(chanRow).join("")}</ul>` : `<p class="empty">No channels found.</p>`}</div>`;
}

// ---------- direct messages ----------
const me = () => state.user.email.toLowerCase();
const nameOf = (e) => state.users.find((u) => u.email === e)?.name || e;
const getRead = (p) => { try { return Number(localStorage.getItem("read:" + p)) || 0; } catch { return 0; } };
const setRead = (p) => { try { localStorage.setItem("read:" + p, String(Date.now())); } catch {} };
const mt = (m) => ms(m.created) || Infinity;
function convos() {
  const g = {};
  state.messages.forEach((m) => { const o = m.participants.find((p) => p !== me()); if (o) (g[o] = g[o] || []).push(m); });
  Object.values(g).forEach((l) => l.sort((a, b) => mt(a) - mt(b)));
  return g;
}
const isUnread = (p, l) => { const last = l[l.length - 1]; return last.from !== me() && mt(last) > getRead(p); };
function unreadCount() {
  if (!state.user) return 0;
  const [r, arg] = (location.hash.slice(1) || "home").split("/");
  return Object.entries(convos()).filter(([p, l]) => !(r === "messages" && arg && decodeURIComponent(arg) === p) && isUnread(p, l)).length;
}

function viewMessages(arg) {
  const peer = arg ? decodeURIComponent(arg) : "", g = convos();
  const list = Object.entries(g).sort((a, b) => mt(b[1][b[1].length - 1]) - mt(a[1][a[1].length - 1]));
  if (peer) setRead(peer);
  const thread = g[peer] || [];
  const others = state.users.filter((u) => u.email !== me());
  const stamp = (m) => (m.created && mt(m) !== Infinity ? new Date(mt(m)).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "sending…");
  return `<h1>Messages</h1><div class="dm">
   <div class="card"><select id="dmnew"><option value="">+ New message…</option>${others.map((u) => `<option value="${esc(u.email)}">${esc(u.name)}</option>`).join("")}</select>
    <ul class="list">${list.map(([p, l]) => `<li><a class="${p === peer ? "on" : ""}" href="#messages/${encodeURIComponent(p)}" style="text-decoration:none"><strong>${esc(nameOf(p))}</strong>${p !== peer && isUnread(p, l) ? ' <span class="badge">new</span>' : ""}<div class="muted">${esc(l[l.length - 1].text.slice(0, 40))}</div></a></li>`).join("") || `<li class="empty">No conversations yet.</li>`}</ul>
    <p class="muted">Only approved members and officers appear here.</p></div>
   <div class="card">${peer ? `<h2>${esc(nameOf(peer))}</h2><div id="thread" class="thread">${thread.map((m) => `<div class="bubble ${m.from === me() ? "mine" : ""}">${esc(m.text)}<div class="muted">${stamp(m)}</div></div>`).join("") || `<p class="empty">Say hi 👋</p>`}</div>
     <form id="dmform" data-peer="${esc(peer)}" class="row" style="flex-wrap:nowrap;margin-top:10px"><input id="dmtext" name="text" autocomplete="off" maxlength="2000" placeholder="Write a message…"><button class="btn pri">Send</button></form>` : `<p class="empty">Pick a conversation or start a new one.</p>`}</div></div>`;
}

// Officers can preview exactly what a member sees: while previewing, the page is drawn as if they weren't an officer.
function render() {
  const real = state.officer;
  if (state.preview) state.officer = false;
  try { renderNow(); } finally { state.officer = real; }
}
function renderNow() {
  if (!state.user || state.pending) return;
  let [r, arg] = (location.hash.slice(1) || "home").split("/");
  if (!state.officer && !MEMBER_TABS.includes(r)) r = "home";
  const views = { home: state.officer ? viewHome : viewMemberHome, teams: () => viewTeams(arg), projects: () => viewProjects(arg), notes: viewNotes, calendar: viewCalendar, requests: viewRequests, messages: () => viewMessages(arg), drive: viewDrive, people: viewPeople, settings: viewSettings, profile: viewProfile, slack: viewSlack, start: viewStart };
  if (r === "drive" && drv.need && drive.connected()) { drv.need = false; loadDrive(false); }
  if ((r === "slack" || r === "teams" || r === "start") && state.officer && state.slack === null && !state.slackLoading) loadSlack();
  const keep = document.activeElement?.id, dmv = $("#dmtext")?.value;
  $("#view").innerHTML = (views[r] || viewHome)();
  const u = unreadCount();
  const navX = $("#nav").scrollLeft;
  $("#nav").innerHTML = ROUTES.filter(([k]) => state.officer ? (k !== "slack" || C.slack?.endpoint || !fb.configured) && (!["people", "settings"].includes(k) || isSenior()) : MEMBER_TABS.includes(k)).map(([k, l]) => `<a href="#${k}" class="${k === r ? "on" : ""}">${l}${k === "messages" && u ? ` <span class="badge">${u}</span>` : ""}</a>`).join("");
  $("#nav").scrollLeft = navX;
  const onTab = $("#nav .on"); if (onTab && r !== renderNow.last) onTab.scrollIntoView({ inline: "center", block: "nearest" });
  renderNow.last = r;
  if (dmv && $("#dmtext")) $("#dmtext").value = dmv;
  const th = $("#thread"); if (th) th.scrollTop = th.scrollHeight;
  if (keep && $("#" + keep)) { const el = $("#" + keep); el.focus?.(); if (el.setSelectionRange && el.type === "text") el.setSelectionRange(99, 99); }
  $("#who").innerHTML = `<span class="muted who-email">${esc(state.user.email)}</span><span class="chip" style="--c:#10204a;margin:0">${state.officer ? "officer" : state.preview ? "member view" : "member"}</span>${state.canPreview ? `<button class="btn sm" id="pv" title="${state.preview ? "Go back to the officer view" : "See exactly what a member sees"}">${state.preview ? "Officer view" : "Member view"}</button>` : ""}<button class="btn sm" id="out">Sign out</button>`;
  if ($("#pv")) $("#pv").onclick = () => { state.preview = !state.preview; location.hash = "#home"; render(); };
  $("#out").onclick = async () => { await fb.signOutUser(); location.href = "index.html"; };
}

// ---------- events ----------
document.addEventListener("input", (e) => {
  if (e.target.id === "nq") { noteFilter.q = e.target.value; render(); }
  if (e.target.id === "sq") { slackQ = e.target.value; render(); }
});
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "dmform") return;
  e.preventDefault();
  const peer = e.target.dataset.peer, text = e.target.elements.text.value.trim();
  if (!text || peer === me()) return;
  e.target.elements.text.value = "";
  try { await fb.addItem("messages", { from: me(), to: peer, participants: [me(), peer], text }); } catch (err) { alert("Could not send: " + err.message); }
});
document.addEventListener("change", (e) => {
  if (e.target.dataset.off) {
    const { off, f } = e.target.dataset, v = e.target.value;
    if (key(off) === me() && f === "title" && v !== "President" && !confirm("You'd stop being the President and lose these controls. Continue?")) { render(); return; }
    fb.updateItem("officers", off, { [f]: v }).catch((err) => { alert("Could not save: " + err.message); render(); });
  }
  if (e.target.id === "dq") { drv.q = e.target.value.trim(); loadDrive(); }
  if (e.target.id === "dmnew" && e.target.value) location.hash = "#messages/" + encodeURIComponent(e.target.value);
  if (e.target.id === "nt") { noteFilter.team = e.target.value; render(); }
  if (e.target.id === "np") { noteFilter.project = e.target.value; render(); }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const a = b.dataset.a;
  if (b.tagName === "A") e.preventDefault();
  if (a.startsWith("drv-")) return driveAction(a, b);
  if (a.startsWith("ppl-")) return peopleAction(a, b);
  if (a.startsWith("set-")) return settingsAction(a, b);
  if (a.startsWith("team-")) return teamAction(a, b);
  if (a.startsWith("sms-")) return smsAction(a, b);
  if (a.startsWith("proj-")) return projAction(a, b);
  if (a === "del" && confirm("Delete this item?")) { await fb.removeItem(b.dataset.c, b.dataset.id); if (b.dataset.c === "notes") await fb.removeItem("publicNotes", b.dataset.id).catch(() => {}); }
  if (a === "tog") {
    const p = state.projects.find((x) => x.id === b.dataset.id), i = Number(b.dataset.i), d = new Set(p.done || []);
    d.has(i) ? d.delete(i) : d.add(i); await fb.updateItem("projects", p.id, { done: [...d] });
  }
  if (a === "startEdit") openForm("Edit the Start here page", [{ name: "body", label: "Page text (## for a heading, - for a bullet)", type: "textarea", rows: 16, value: startBody() }], (v) => fb.setItem("pages", "start", { body: v.body }));
  if (a === "note-edit") { const n = state.notes.find((x) => x.id === b.dataset.id); if (n) openForm("Edit meeting notes", noteFields(n), saveNote(n.id)); }
  if (a === "addPubLink") openForm("Add a link for members", [{ name: "name", label: "Label", required: true, ph: "Join our Discord" }, { name: "url", label: "URL", type: "url", required: true }], (v) => fb.addItem("publicLinks", v));
  if (a === "addLink") openForm("Add a link", [{ name: "name", label: "Label", required: true, ph: "Trello board" }, { name: "url", label: "URL", type: "url", required: true }], (v) => fb.addItem("links", v));
  if (a === "addAnn") openForm(b.dataset.aud === "members" ? "New member announcement" : "New officer announcement", [{ name: "title", label: "Title", required: true }, { name: "body", label: "Details", type: "textarea" }, { name: "pinned", label: "Pin to top", type: "check" }, ...(C.slack?.endpoint || !fb.configured ? [{ name: "slack", label: "Also post to Slack", type: "check", value: true }] : [])], async (v) => {
    const { slack, ...ann } = v;
    await fb.addItem("announcements", { ...ann, audience: b.dataset.aud === "members" ? "members" : "officers" });
    if (slack) await postToSlack(ann).catch((err) => alert("Saved in the hub, but it couldn't be posted to Slack: " + err.message));
  });
  if (a === "addProj") openForm("New project", projectFields(), (v) => fb.addItem("projects", { ...v, links: [], done: [] }));
  if (a === "addNote") openForm("Add meeting notes", noteFields(), saveNote());
});
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

// A list that can't load (rules not published, access removed) used to just look empty. Say so at the top of the page.
const failed = new Set();
window.addEventListener("watch-error", (e) => {
  failed.add(e.detail);
  const el = $("#demo");
  el.hidden = false;
  el.textContent = `Couldn't load: ${[...failed].join(", ")}. Check your connection, and make sure the latest firestore.rules are published in Firebase.`;
});

// ---------- Settings: what used to live in config.js, now editable by officers in the hub ----------
const applyAll = () => { applySettings(C, state.pubDoc, state.setDoc); $("#brand").textContent = C.orgName; document.title = pageTitle(); };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "team";
const driveId = (s) => (String(s).match(/folders\/([\w-]+)/) || [, String(s).trim()])[1]; // accepts the folder's web address or just its ID
const parseMs = (t) => t.split("\n").map((l) => l.match(/^\s*(\d+)\s*\|\s*(.+?)\s*$/)).filter(Boolean).map((m) => ({ weeks: Number(m[1]), label: m[2] })).sort((a, b) => b.weeks - a.weeks);
async function saveSettings(patch) {
  Object.assign(C, patch);
  const pub = { orgName: C.orgName, tagline: C.tagline, about: C.about, meetingInfo: C.meetingInfo, joinUrl: C.joinUrl, smsDisclosure: C.sms?.disclosure || "", slackEndpoint: C.slack?.endpoint || "", teams: C.teams.map(({ id, name, color, desc }) => ({ id, name, color, desc })) };
  const set = { calendarId: C.calendarId, calendarTimezone: C.calendarTimezone, driveRootId: C.driveRootId, turnaround: C.turnaround, forms: C.forms, milestones: C.milestones, teams: C.teams, officerTitles: titles() };
  await fb.setItem("public", "site", pub);
  await fb.setItem("settings", "site", set);
  state.pubDoc = pub; state.setDoc = set;
  $("#brand").textContent = C.orgName; document.title = pageTitle();
  render();
}
const teamFields = (t = {}) => [
  { name: "name", label: "Team name", required: true, value: t.name },
  { name: "color", label: "Color", type: "color", value: t.color || "#10204a" },
  { name: "desc", label: "What the team does", value: t.desc },
  { name: "slack", label: "Slack channel link (optional)", type: "url", value: t.slack === "#" ? "" : t.slack },
  { name: "drive", label: "Drive folder link (optional)", type: "url", value: t.drive === "#" ? "" : t.drive },
];
const formFields = (f = {}) => [
  { name: "name", label: "Form name", required: true, value: f.name },
  { name: "desc", label: "What it's for", value: f.desc },
  { name: "url", label: "Link", type: "url", required: true, value: f.url },
];
function viewSettings() {
  if (!isSenior()) return `<p class="empty">Senior officers only.</p>`;
  const kv = (k, v) => `<div class="row" style="justify-content:flex-start;align-items:flex-start;gap:8px;flex-wrap:nowrap;margin:4px 0"><span class="muted" style="min-width:96px;flex:none">${k}</span><span style="min-width:0">${esc(v) || '<span class="muted">not set</span>'}</span></div>`;
  const btn = (label, a, extra = "") => `<button class="btn sm" data-a="${a}" ${extra}>${label}</button>`;
  return `<h1>Settings</h1><p class="muted">Change how the hub looks and what it links to. Saved for everyone, and no need to touch GitHub or Firebase. The first save keeps everything currently in <code>config.js</code> as your starting point.</p>
  <div class="grid cols-2">
   <div class="card"><div class="row"><h2>Organization</h2>${btn("Edit", "set-org")}</div>${kv("Name", C.orgName)}${kv("Tagline", C.tagline)}${kv("About", C.about)}${kv("Meetings", C.meetingInfo)}${kv("Join link", C.joinUrl === "#" ? "" : C.joinUrl)}${kv("Turnaround", C.turnaround)}</div>
   <div class="card"><div class="row"><h2>Calendar and Drive</h2>${btn("Edit", "set-cal")}</div>${kv("Calendar", C.calendarId)}${kv("Time zone", C.calendarTimezone)}${kv("Drive folder", C.driveRootId)}</div>
   <div class="card"><div class="row"><h2>Teams</h2>${btn("+ Add team", "set-team-add")}</div>
    <ul class="list">${C.teams.map((t) => `<li><div class="row"><span><span class="chip" style="--c:${esc(t.color)}">${esc(t.name)}</span> <span class="muted">${esc(t.desc || "")}</span></span><span>${btn("Edit", "set-team-edit", `data-id="${esc(t.id)}"`)} <button class="btn sm del" data-a="set-team-del" data-id="${esc(t.id)}">Delete</button></span></div></li>`).join("")}</ul></div>
   <div class="card"><div class="row"><h2>Request forms</h2>${btn("+ Add form", "set-form-add")}</div>
    ${C.forms.length ? `<ul class="list">${C.forms.map((f, i) => `<li><div class="row"><span><strong>${esc(f.name)}</strong><div class="muted">${esc(f.desc || "")}</div></span><span>${btn("Edit", "set-form-edit", `data-i="${i}"`)} <button class="btn sm del" data-a="set-form-del" data-i="${i}">Delete</button></span></div></li>`).join("")}</ul>` : `<p class="empty">No forms yet.</p>`}</div>
   <div class="card"><div class="row"><h2>Text-alert wording</h2>${btn("Edit", "set-sms")}</div><p class="muted" style="white-space:pre-wrap">${esc(C.sms?.disclosure || "")}</p></div>
   <div class="card"><div class="row"><h2>Slack connection</h2>${btn("Edit", "set-slack")}</div>${kv("Worker address", C.slack?.endpoint)}<p class="muted">Leave it blank to hide the Channels tab.</p></div>
   <div class="card"><div class="row"><h2>Project checkpoints</h2>${btn("Edit", "set-ms")}</div>${C.milestones.map((m) => kv(m.weeks + " wk before", m.label)).join("")}</div>
   <div class="card"><div class="row"><h2>Officer roles</h2>${btn("Edit", "set-titles")}</div><p class="muted">The Role dropdown for officers: ${titles().map(esc).join(" · ")}. Keep <strong>President</strong>, it is what gives the president their powers.</p></div>
   <div class="card"><h2>Start over</h2><p class="muted">Delete everything saved on this page and go back to the defaults in <code>config.js</code>.</p><button class="btn sm del" data-a="set-reset">Reset to defaults</button></div>
  </div>`;
}
async function settingsAction(a, b) {
  const id = b.dataset.id, i = Number(b.dataset.i);
  try {
    if (a === "set-org") openForm("Organization", [
      { name: "orgName", label: "Organization name", required: true, value: C.orgName },
      { name: "tagline", label: "Tagline", value: C.tagline },
      { name: "about", label: "About (shown on the public page)", type: "textarea", rows: 4, value: C.about },
      { name: "meetingInfo", label: "Meeting info (shown on the public page)", value: C.meetingInfo },
      { name: "joinUrl", label: "Join or interest-form link", type: "url", value: C.joinUrl === "#" ? "" : C.joinUrl },
      { name: "turnaround", label: "Turnaround note shown with the request forms", value: C.turnaround },
    ], (v) => saveSettings({ ...v, joinUrl: v.joinUrl || "#" }));
    else if (a === "set-cal") openForm("Calendar and Drive", [
      { name: "calendarId", label: "Google Calendar ID (Calendar settings > Integrate calendar)", value: C.calendarId },
      { name: "calendarTimezone", label: "Time zone", value: C.calendarTimezone },
      { name: "driveRootId", label: "Drive folder (paste its web address or its ID)", value: C.driveRootId },
    ], (v) => saveSettings({ calendarId: v.calendarId, calendarTimezone: v.calendarTimezone || "America/Chicago", driveRootId: driveId(v.driveRootId) }));
    else if (a === "set-sms") openForm("Text-alert wording", [{ name: "disclosure", label: "Exactly what people agree to. {org} becomes your organization's name. Each person's agreement saves the wording they saw.", type: "textarea", rows: 6, required: true, value: C.sms?.disclosure }], (v) => saveSettings({ sms: { ...C.sms, disclosure: v.disclosure } }));
    else if (a === "set-slack") openForm("Slack connection", [{ name: "endpoint", label: "Cloudflare Worker address (https://…workers.dev). Blank hides the Channels tab.", type: "url", value: C.slack?.endpoint }], (v) => saveSettings({ slack: { ...C.slack, endpoint: v.endpoint } }));
    else if (a === "set-titles") openForm("Officer roles", [{ name: "t", label: "One role per line, for example Treasurer. Keep President.", type: "textarea", rows: 8, value: titles().join("\n") }], (v) => {
      const t = v.t.split("\n").map((x) => x.trim().slice(0, 40)).filter(Boolean);
      if (!t.length) throw new Error("Add at least one role.");
      return saveSettings({ officerTitles: t });
    });
    else if (a === "set-ms") openForm("Project checkpoints", [{ name: "ms", label: "One per line: weeks before the due date | what to do. Changing these can shift which checkpoints show as done on existing projects.", type: "textarea", rows: 7, value: C.milestones.map((m) => `${m.weeks} | ${m.label}`).join("\n") }], (v) => {
      const ms = parseMs(v.ms);
      if (!ms.length) throw new Error("Use lines like: 6 | Kickoff and budget plan");
      return saveSettings({ milestones: ms });
    });
    else if (a === "set-team-add") openForm("Add a team", teamFields(), (v) => {
      let tid = slug(v.name);
      while (C.teams.some((t) => t.id === tid)) tid += "x";
      return saveSettings({ teams: [...C.teams, { id: tid, name: v.name, color: v.color, desc: v.desc, slack: v.slack || "#", drive: v.drive || "#" }] });
    });
    else if (a === "set-team-edit") openForm("Edit team", teamFields(C.teams.find((t) => t.id === id)), (v) => saveSettings({ teams: C.teams.map((t) => (t.id === id ? { ...t, ...v, slack: v.slack || "#", drive: v.drive || "#" } : t)) }));
    else if (a === "set-team-del") {
      if (C.teams.length < 2) { alert("Keep at least one team."); return; }
      if (confirm("Delete this team? Projects that used it will just stop showing its label.")) await saveSettings({ teams: C.teams.filter((t) => t.id !== id) });
    }
    else if (a === "set-form-add") openForm("Add a request form", formFields(), (v) => saveSettings({ forms: [...C.forms, { ...v, embed: "" }] }));
    else if (a === "set-form-edit") openForm("Edit request form", formFields(C.forms[i]), (v) => saveSettings({ forms: C.forms.map((f, j) => (j === i ? { ...f, ...v } : f)) }));
    else if (a === "set-form-del") { if (confirm("Delete this form?")) await saveSettings({ forms: C.forms.filter((_, j) => j !== i) }); }
    else if (a === "set-reset") {
      if (!confirm("Delete everything saved on the Settings page and go back to the defaults in config.js?")) return;
      await fb.removeItem("public", "site"); await fb.removeItem("settings", "site");
      location.reload();
    }
  } catch (err) { alert("Could not save: " + err.message); }
}

// ---------- boot ----------
fb.onAuth(async (user) => {
  if (!user) {
    $("#view").innerHTML = `<div class="hero"><h1>Sign in to continue</h1><p>Use your Google account.</p><button class="btn pri" id="in">Sign in with Google</button></div>`;
    $("#in").onclick = () => fb.signIn();
    return;
  }
  state.user = user;
  try { state.pubDoc = await fb.getItem("public", "site"); applyAll(); } catch {} // org name, wording and Slack address officers saved in the hub
  await fb.upsertUser(user).catch(() => {});
  if (fb.configured && C.slack?.endpoint) { // Slack membership decides officer status; if this fails, nothing changes
    try { await fetch(C.slack.endpoint.replace(/\/$/, "") + "/sync", { method: "POST", headers: { Authorization: "Bearer " + (await fb.idToken()) }, signal: AbortSignal.timeout(8000) }); } catch {} // 8s cap so a slow Slack can't freeze sign-in
  }
  const role = await fb.getRole(user);
  if (role === "error") { // the check itself failed, which is not the same as "not approved"
    state.pending = true; // stops the normal page from drawing
    $("#nav").innerHTML = ""; $("#who").innerHTML = "";
    $("#view").innerHTML = `<div class="hero"><h1>Couldn't check your access</h1><p>Check your connection and try again. If it keeps happening, tell an officer. The latest rules may not be published yet.</p><button class="btn pri" id="chk">Try again</button> <button class="btn" id="so">Sign out</button></div>`;
    $("#chk").onclick = () => location.reload();
    $("#so").onclick = async () => { await fb.signOutUser(); location.href = "index.html"; };
    return;
  }
  try { state.sms = await fb.getItem("smsConsent", user.email.toLowerCase()); } catch { state.sms = null; }
  try { state.nick = (await fb.getItem("users", user.email.toLowerCase()))?.name || ""; } catch { state.nick = ""; }
  if (role === "pending") {
    state.pending = true;
    $("#nav").innerHTML = ""; $("#who").innerHTML = "";
    $("#view").innerHTML = `<div class="hero"><h1>Waiting for approval</h1><p>You're signed in as ${esc(user.email)}. An officer needs to approve your account before you can see the hub.</p><button class="btn pri" id="chk">Check again</button> <button class="btn" id="so">Sign out</button></div><div class="card" id="nickcard" style="max-width:520px;margin:0 auto 16px"></div><div class="card" id="smscard" style="max-width:520px;margin:0 auto 40px"></div>`;
    $("#nickcard").innerHTML = nickInner();
    $("#smscard").innerHTML = smsInner();
    $("#chk").onclick = () => location.reload();
    $("#so").onclick = async () => { await fb.signOutUser(); location.href = "index.html"; };
    return;
  }
  state.officer = role === "officer";
  state.canPreview = state.officer;
  try { state.setDoc = await fb.getItem("settings", "site"); applyAll(); } catch {} // calendar, Drive, forms, team links, checkpoints
  if (state.officer) {
    fb.watchDMs(user.email.toLowerCase(), (d) => { state.messages = d; render(); });
    const seen = new Set(), trySync = () => { if (seen.has("notes") && seen.has("publicNotes") && !state.mirrored) { state.mirrored = true; syncMirrors().catch((e) => console.error("notes sync", e)); } };
    for (const c of ["announcements", "projects", "notes", "links", "publicLinks", "publicNotes", "pages"]) fb.watch(c, (d) => { state[c] = d; seen.add(c); render(); trySync(); });
    fb.watch("members", (d) => { state.members = d; rebuildDir(); render(); });
    fb.watch("officers", (d) => { state.officers = d; rebuildDir(); render(); });
    fb.watch("users", (d) => { state.signups = d; render(); });
    fb.watch("smsConsent", (d) => { state.smsList = d; render(); });
    fb.watch("teamPerms", (d) => { state.teamPerms = Object.fromEntries(d.map((x) => [x.id, x])); render(); });
    try { // the list of removed Slack officers is only readable by the president
      if ((await fb.getItem("officers", user.email.toLowerCase()))?.title === "President") fb.watch("blockedOfficers", (d) => { state.blocked = d; render(); });
    } catch {}
  } else { // members: only member announcements, notes tagged public, and the links list
    fb.watchWhere("announcements", "audience", "members", (d) => { state.announcements = d; render(); });
    fb.watch("publicNotes", (d) => { state.publicNotes = d; render(); });
    fb.watch("publicLinks", (d) => { state.publicLinks = d; render(); });
  }
  render();
});
