import { CONFIG as C } from "./config.js";
import * as fb from "./firebase.js";
import * as drive from "./drive.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const url = (u) => (/^https?:\/\//i.test(u || "") ? esc(u) : "#");
const state = { user: null, officer: false, announcements: [], projects: [], notes: [], users: [], messages: [], members: [], officers: [], signups: [], pending: false, sms: null, smsList: [], links: [], slack: null, slackErr: "", slackLoading: false };
const team = (id) => C.teams.find((t) => t.id === id);
const chip = (id) => { const t = team(id); return t ? `<span class="chip" style="--c:${esc(t.color)}">${esc(t.name)}</span>` : id === "all" ? `<span class="chip">All org</span>` : ""; };

document.documentElement.style.setProperty("--accent", C.accent);
document.documentElement.style.setProperty("--red", C.accent2);
document.title = C.orgName + " Hub";
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
    if (x.type === "checks") return `<label>${esc(x.label)}</label><div class="checks">${x.options.map((o) => `<label class="inline"><input type="checkbox" name="${x.name}" value="${esc(o.value)}">${esc(o.label)}</label>`).join("")}</div>`;
    if (x.type === "check") return `<label class="inline"><input type="checkbox" name="${x.name}">${esc(x.label)}</label>`;
    if (x.type === "textarea") return `<label>${esc(x.label)}<textarea name="${x.name}" rows="3"></textarea></label>`;
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
const ROUTES = [["home", "Home"], ["teams", "Teams"], ["projects", "Projects"], ["notes", "Meeting notes"], ["messages", "Messages"], ["drive", "Drive"], ["slack", "Channels"], ["people", "People"], ["profile", "Profile"], ["calendar", "Calendar"], ["requests", "Requests"]];
const officerBtn = (label, action, extra = "") => (state.officer ? `<button class="btn pri sm" data-a="${action}" ${extra}>${label}</button>` : "");
const delBtn = (coll, id) => (state.officer ? `<button class="btn sm del" data-a="del" data-c="${coll}" data-id="${esc(id)}">Delete</button>` : "");

function viewHome() {
  const anns = [...state.announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ms(b.created) - ms(a.created));
  const upcoming = state.projects.flatMap((p) => checkpoints(p).filter((c) => !c.done).map((c) => ({ ...c, p, n: daysFrom(c.date) })))
    .filter((c) => c.n <= 14).sort((a, b) => a.n - b.n);
  const notes = [...state.notes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  return `
  <div class="row"><h1>Next 14 days</h1><span class="muted">Checkpoints from every project, soonest first</span></div>
  <div class="grid cols-2" style="margin-top:12px">
    <div class="card"><h2>Coming up</h2>${upcoming.length ? `<ul class="list">${upcoming.map((c) => `
      <li><div class="row"><span><strong>${esc(c.p.name)}</strong> ${chip(c.p.owner)}</span><span class="due ${cls(c.n)}">${rel(c.n)}</span></div>
      <div class="muted">${esc(c.label)} · ${fmt(c.date)}</div></li>`).join("")}</ul>` : `<p class="empty">Nothing due in the next two weeks. 🎉</p>`}</div>

    <div class="card"><div class="row"><h2>Announcements</h2>${officerBtn("+ Post", "addAnn")}</div>
      ${anns.length ? anns.map((a) => `<div class="card ${a.pinned ? "pin" : ""}" style="margin-top:8px"><div class="row"><strong>${a.pinned ? "📌 " : ""}${esc(a.title)}</strong>${delBtn("announcements", a.id)}</div><div>${esc(a.body)}</div></div>`).join("") : `<p class="empty">No announcements.</p>`}</div>

    <div class="card"><div class="row"><h2>Latest meeting notes</h2><a href="#notes">All notes</a></div>
      ${notes.length ? `<ul class="list">${notes.map(noteLi).join("")}</ul>` : `<p class="empty">No notes yet.</p>`}</div>

    <div class="card"><h2>Requests</h2><p class="muted">${esc(C.turnaround)}</p>
      <div class="grid">${C.forms.map((f) => `<div><strong>${esc(f.name)}</strong><div class="muted">${esc(f.desc)}</div><a class="btn pri sm" target="_blank" rel="noopener" href="${url(f.url)}">Open form</a></div>`).join("")}</div>
      <div class="row" style="margin-top:14px"><h3>Quick links</h3>${officerBtn("+ Add link", "addLink")}</div>${[...C.orgLinks.filter((l) => l.url && l.url !== "#"), ...state.links].map((l) => `<a class="btn sm" target="_blank" rel="noopener" href="${url(l.url)}">${esc(l.name)}</a>${l.id && state.officer ? `<button class="btn sm del" data-a="del" data-c="links" data-id="${esc(l.id)}" title="Remove">×</button>` : ""} `).join("")}
    </div>
  </div>`;
}

function noteLi(n) {
  const pr = state.projects.find((p) => p.id === n.project);
  return `<li><div class="row"><span><a target="_blank" rel="noopener" href="${url(n.url)}"><strong>${esc(n.title)}</strong></a> ${chip(n.team)}${pr ? `<span class="muted">· <a href="#projects/${esc(pr.id)}">${esc(projName(pr))}</a></span>` : ""}</span><span class="muted">${fmt(parse(n.date))} ${delBtn("notes", n.id)}</span></div></li>`;
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
    ${["slack", "drive", "trello"].map((k) => `<a class="btn sm" target="_blank" rel="noopener" href="${url(t[k])}">${k[0].toUpperCase() + k.slice(1)}</a>`).join(" ")}</span></div><p class="muted">${esc(t.desc)}</p>
  <div class="grid cols-2">
    <div class="card"><h2>Asks from other teams</h2><p class="muted">Projects that need something from ${esc(t.name)}.</p>${asks.length ? `<ul class="list">${asks.map((p) => { const nx = checkpoints(p).find((c) => !c.done); return `<li><strong>${esc(p.name)}</strong> ${chip(p.owner)}<div class="muted">${nx ? `${esc(nx.label)} · <span class="due ${cls(daysFrom(nx.date))}">${rel(daysFrom(nx.date))}</span>` : "All checkpoints done"}</div></li>`; }).join("")}</ul>` : `<p class="empty">No open asks.</p>`}</div>
    <div class="card"><h2>${esc(t.name)} projects</h2>${own.length ? `<ul class="list">${own.map((p) => `<li><strong>${esc(p.name)}</strong> <span class="muted">${p.due ? "due " + fmt(parse(p.due)) + " · " + progress(p) + "%" : "folder"}</span></li>`).join("")}</ul>` : `<p class="empty">None yet.</p>`}</div>
    ${teamChannels(t)}
    <div class="card"><h2>Meeting notes</h2>${notes.length ? `<ul class="list">${notes.map(noteLi).join("")}</ul>` : `<p class="empty">None yet.</p>`}</div>
  </div>`;
}

const projName = (p) => { const par = state.projects.find((x) => x.id === p.parent); return (par ? par.name + " › " : "") + p.name; };
const projLinks = (p) => [
  ...(p.links || []).map((l, i) => ({ ...l, i })),
  ...(p.trello ? [{ name: "Trello", url: p.trello, legacy: "trello" }] : []),
  ...(p.drive ? [{ name: "Drive folder", url: p.drive, legacy: "drive" }] : []),
];
const projData = (v) => {
  const { trello, drive: d, ...rest } = v, links = [];
  if (trello) links.push({ name: "Trello", url: trello });
  if (d) links.push({ name: "Drive folder", url: d });
  return { ...rest, links, done: [] };
};
const cpRows = (p) => checkpoints(p).map((c) => `<div class="cp ${c.done ? "done" : ""}"><input type="checkbox" style="width:auto" ${c.done ? "checked" : ""} ${state.officer ? "" : "disabled"} data-a="tog" data-id="${esc(p.id)}" data-i="${c.i}"><span>${esc(c.label)} <span class="muted">· ${fmt(c.date)}</span></span></div>`).join("");

function projCard(p) {
  const n = p.due ? daysFrom(parse(p.due)) : null, subs = state.projects.filter((x) => x.parent === p.id).length, tracked = checkpoints(p).length > 0;
  return `<div class="card"><div class="row"><h2><a href="#projects/${esc(p.id)}" style="text-decoration:none">${esc(p.name)}</a></h2>${p.due ? `<span class="due ${cls(n)}">${fmt(parse(p.due))} · ${rel(n)}</span>` : `<span class="muted">${subs} sub-project${subs === 1 ? "" : "s"}</span>`}</div>
    <div>Owner ${chip(p.owner)} ${(p.needsFrom || []).length ? `<span class="muted">needs:</span> ${p.needsFrom.map(chip).join("")}` : ""}</div>
    ${tracked ? `<div class="bar"><i style="width:${progress(p)}%"></i></div>${cpRows(p)}` : ""}
    <div style="margin-top:8px"><a class="btn sm" href="#projects/${esc(p.id)}">Open</a> ${p.due && subs ? `<span class="muted">${subs} sub-project${subs === 1 ? "" : "s"}</span>` : ""}</div></div>`;
}

function viewProjects(arg) {
  if (arg) return viewProject(decodeURIComponent(arg));
  const top = state.projects.filter((p) => !p.parent).sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
  return `<div class="row"><h1>Projects</h1>${officerBtn("+ New project", "addProj")}</div>
  <p class="muted">Open a project to see its sub-projects, links and notes. Projects with a due date get automatic checkpoints. Leave the date blank for a folder-style project like "General meetings".</p>
  <div class="grid cols-2">${top.map(projCard).join("") || `<p class="empty">No projects yet.</p>`}</div>`;
}

function viewProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return `<p><a href="#projects">← Projects</a></p><p class="empty">Project not found.</p>`;
  const par = state.projects.find((x) => x.id === p.parent), x = `data-id="${esc(p.id)}"`;
  const subs = state.projects.filter((s) => s.parent === id).sort((a, b) => (b.due || "").localeCompare(a.due || ""));
  const notes = state.notes.filter((n) => n.project === id).sort((a, b) => b.date.localeCompare(a.date));
  const links = projLinks(p), tracked = checkpoints(p).length > 0, n = p.due ? daysFrom(parse(p.due)) : null;
  const subRow = (s) => `<li><div class="row"><a href="#projects/${esc(s.id)}"><strong>${esc(s.name)}</strong></a><span class="muted">${s.due ? fmt(parse(s.due)) + " · " : ""}${state.notes.filter((q) => q.project === s.id).length} notes · ${projLinks(s).length} links</span></div></li>`;
  return `<p class="muted"><a href="#projects">Projects</a> / ${par ? `<a href="#projects/${esc(par.id)}">${esc(par.name)}</a> / ` : ""}${esc(p.name)}</p>
  <div class="row"><h1>${esc(p.name)}</h1>${p.due ? `<span class="due ${tracked ? cls(n) : ""}">${fmt(parse(p.due))}${tracked ? " · " + rel(n) : ""}</span>` : ""}</div>
  <p>Owner ${chip(p.owner)} ${(p.needsFrom || []).length ? `<span class="muted">needs:</span> ${p.needsFrom.map(chip).join("")}` : ""}</p>
  <div class="grid cols-2">
   ${tracked ? `<div class="card"><h2>Checkpoints</h2><div class="bar"><i style="width:${progress(p)}%"></i></div>${cpRows(p)}</div>` : ""}
   <div class="card"><div class="row"><h2>Links</h2>${officerBtn("+ Link", "proj-addlink", x)}</div>
    ${links.length ? `<ul class="list">${links.map((l) => `<li><div class="row"><a target="_blank" rel="noopener" href="${url(l.url)}">${esc(l.name)}</a>${state.officer ? `<button class="btn sm del" data-a="proj-rmlink" ${x} ${l.legacy ? `data-k="${l.legacy}"` : `data-i="${l.i}"`}>×</button>` : ""}</div></li>`).join("")}</ul>` : `<p class="empty">No links yet. Add the agenda, slides, a folder…</p>`}</div>
   <div class="card"><div class="row"><h2>Meeting notes</h2>${officerBtn("+ Notes", "proj-addnote", x)}</div>
    ${notes.length ? `<ul class="list">${notes.map(noteLi).join("")}</ul>` : `<p class="empty">No notes linked yet.</p>`}</div>
   ${!p.parent ? `<div class="card"><div class="row"><h2>Sub-projects</h2>${officerBtn("+ Sub-project", "proj-addsub", x)}</div>${subs.length ? `<ul class="list">${subs.map(subRow).join("")}</ul>` : `<p class="empty">None yet. For example, one for each general meeting.</p>`}</div>` : ""}
  </div>
  ${state.officer ? `<p style="margin-top:16px"><button class="btn sm del" data-a="proj-del" ${x}>Delete this ${p.parent ? "sub-project" : "project"}</button></p>` : ""}`;
}

async function projAction(a, b) {
  const p = state.projects.find((x) => x.id === b.dataset.id);
  if (!p) return;
  try {
    if (a === "proj-addsub") openForm("New sub-project", [{ name: "name", label: "Name", required: true, ph: "General meeting: Nov 4" }, { name: "due", label: "Date (optional)", type: "date" }], (v) => fb.addItem("projects", { name: v.name, due: v.due, owner: p.owner, parent: p.id, needsFrom: [], links: [], done: [] }));
    else if (a === "proj-addlink") openForm("Add a link", [{ name: "name", label: "Label", required: true, ph: "Agenda doc" }, { name: "url", label: "URL", type: "url", required: true }], (v) => fb.updateItem("projects", p.id, { links: [...(p.links || []), v] }));
    else if (a === "proj-addnote") openForm("Add meeting notes", noteFields({ project: p.id }), (v) => fb.addItem("notes", v));
    else if (a === "proj-rmlink") {
      if (b.dataset.k) await fb.updateItem("projects", p.id, { [b.dataset.k]: "" });
      else await fb.updateItem("projects", p.id, { links: (p.links || []).filter((_, i) => i !== Number(b.dataset.i)) });
    } else if (a === "proj-del") {
      const kids = state.projects.filter((x) => x.parent === p.id);
      if (!confirm(`Delete "${p.name}"${kids.length ? ` and its ${kids.length} sub-project${kids.length === 1 ? "" : "s"}` : ""}? Meeting-note links stay in the Notes tab.`)) return;
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
  const src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(C.calendarId)}&ctz=${encodeURIComponent(C.calendarTimezone)}&showTitle=0`;
  return `<h1>Calendar</h1><iframe src="${src}" style="height:70vh" title="Calendar"></iframe>`;
}

function viewRequests() {
  return `<h1>Requests</h1><p class="muted">${esc(C.turnaround)}</p><div class="grid cols-2">${C.forms.map((f) => `<div class="card"><h2>${esc(f.name)}</h2><p>${esc(f.desc)}</p><a class="btn pri" target="_blank" rel="noopener" href="${url(f.url)}">Open form</a>${f.embed ? `<iframe src="${url(f.embed)}" style="height:520px;margin-top:12px" title="${esc(f.name)}"></iframe>` : ""}</div>`).join("")}</div>`;
}

const noteFields = (v = {}) => [{ name: "title", label: "Title", required: true, ph: "Media sync", value: v.title }, { name: "date", label: "Meeting date", type: "date", required: true, value: v.date }, { name: "team", label: "Team", type: "select", options: teamOpts(true) }, { name: "project", label: "Project (optional)", type: "select", value: v.project, options: [{ value: "", label: "—" }, ...state.projects.map((p) => ({ value: p.id, label: projName(p) }))] }, { name: "url", label: "Google Doc link", type: "url", required: true, value: v.url }];

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
      openForm("Add meeting notes", noteFields({ title: b.dataset.n, url: b.dataset.l, date: new Date().toISOString().slice(0, 10) }), (v) => fb.addItem("notes", v));
    }
  } catch (err) { drv.loading = false; drv.error = err.message === "expired" ? "Your Drive connection expired. Please reconnect." : err.message; render(); }
}

// ---------- People (officers approve members) ----------
function rebuildDir() {
  const seen = new Set();
  state.users = [...state.officers, ...state.members].filter((d) => !seen.has(d.id) && seen.add(d.id)).map((d) => ({ email: d.id, name: d.name || d.id }));
}
function viewPeople() {
  if (!state.officer) return `<p class="empty">Officers only.</p>`;
  const have = new Set([...state.members, ...state.officers].map((d) => d.id));
  const pending = state.signups.filter((u) => !have.has(u.id)).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const members = state.members.filter((m) => !state.officers.some((o) => o.id === m.id)).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return `<h1>People</h1><p class="muted">Anyone can sign in with Google, but they see nothing until you approve them here.</p>
  <div class="grid cols-2">
   <div class="card"><h2>Waiting for approval <span class="badge">${pending.length}</span></h2>
    ${pending.length ? `<ul class="list">${pending.map((u) => `<li><div class="row"><span><strong>${esc(u.name || u.id)}</strong><div class="muted">${esc(u.id)}</div></span><span><button class="btn pri sm" data-a="ppl-approve" data-id="${esc(u.id)}" data-n="${esc(u.name || "")}">Approve</button> <button class="btn sm del" data-a="ppl-decline" data-id="${esc(u.id)}">Decline</button></span></div></li>`).join("")}</ul>` : `<p class="empty">No one is waiting.</p>`}
    <p class="muted">Decline just clears the request. They'll reappear if they sign in again.</p></div>
   <div class="card"><h2>Members <span class="badge">${members.length}</span></h2>
    ${members.length ? `<ul class="list">${members.map((m) => `<li><div class="row"><span><strong>${esc(m.name || m.id)}</strong><div class="muted">${esc(m.id)}</div></span><button class="btn sm del" data-a="ppl-remove" data-id="${esc(m.id)}">Remove</button></div></li>`).join("")}</ul>` : `<p class="empty">No members yet.</p>`}</div>
   ${smsListCard()}
   <div class="card"><h2>Officers</h2><ul class="list">${state.officers.map((o) => `<li><strong>${esc(o.name || o.id)}</strong><div class="muted">${esc(o.id)}</div></li>`).join("")}</ul>
    <p class="muted">Officers are a fixed list. Add or remove them in the Firebase console (Firestore, <code>officers</code> collection).</p></div>
  </div>`;
}
async function peopleAction(a, b) {
  try {
    if (a === "ppl-approve") await fb.setItem("members", b.dataset.id, { email: b.dataset.id, name: b.dataset.n || b.dataset.id, approvedBy: me() });
    else if (a === "ppl-decline") { if (confirm("Clear this request?")) await fb.removeItem("users", b.dataset.id); }
    else if (a === "ppl-remove") { if (confirm("Remove this member? They'll lose access until approved again.")) await fb.removeItem("members", b.dataset.id); }
  } catch (err) { alert("Could not update: " + err.message); }
}

// ---------- Text alerts (consent capture + officer export) ----------
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
  return `<h1>Profile</h1><div class="card"><strong>${esc(state.user.displayName || "")}</strong><div class="muted">${esc(state.user.email)} · ${state.officer ? "officer" : "member"}</div></div>
  ${C.sms?.enabled ? `<div class="card" id="smscard" style="margin-top:16px">${smsInner()}</div>` : ""}`;
}
function smsListCard() {
  if (!C.sms?.enabled) return "";
  const on = state.smsList.filter((x) => x.consent).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return `<div class="card"><h2>Text alerts list <span class="badge">${on.length}</span></h2>
  <p class="muted">People who opted in. Each has a saved record of when they agreed and the exact wording they saw.</p>
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
      const on = state.smsList.filter((x) => x.consent);
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
  const data = { email: me(), name: state.user.displayName || me(), phone, consent: true, disclosure: disclosure(), consentedAt: new Date().toISOString() };
  try { await fb.setItem("smsConsent", me(), data); state.sms = { id: me(), ...data }; refreshSms(); } catch (err) { alert("Could not save: " + err.message); }
});

// ---------- Slack channels (auto-updating) ----------
let slackQ = "";
async function loadSlack() {
  if (fb.configured && !C.slack?.endpoint) { state.slack = { team: "", channels: [] }; return; }
  state.slackLoading = true;
  try {
    if (!fb.configured) state.slack = { team: "T0", channels: [{ id: "C1", name: "media", topic: "Photo, video, graphics", members: 12 }, { id: "C2", name: "finance", topic: "Budget and reimbursements", members: 6 }, { id: "C3", name: "events-fall-showcase", topic: "Planning the showcase", members: 18 }, { id: "C4", name: "general", topic: "", members: 80 }] };
    else {
      const r = await fetch(C.slack.endpoint, { headers: { Authorization: "Bearer " + (await fb.idToken()) } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Error " + r.status);
      state.slack = await r.json();
    }
    state.slackErr = "";
  } catch (e) { state.slack = { team: "", channels: [] }; state.slackErr = e.message; }
  state.slackLoading = false; render();
}
const chanUrl = (c) => `https://slack.com/app_redirect?team=${encodeURIComponent(state.slack.team)}&channel=${encodeURIComponent(c.id)}`;
const chanRow = (c) => `<li><div class="row"><span><a target="_blank" rel="noopener" href="${chanUrl(c)}"><strong>#${esc(c.name)}</strong></a> <span class="muted">${c.members} members</span>${c.topic ? `<div class="muted">${esc(c.topic)}</div>` : ""}</span></div></li>`;
function teamChannels(t) {
  const ch = (state.slack?.channels || []).filter((c) => c.name.includes(t.id) || c.name.includes(t.name.toLowerCase()));
  if (!state.slack || (!ch.length && !state.slackErr)) return "";
  return `<div class="card"><h2>Slack channels</h2><ul class="list">${ch.map(chanRow).join("")}</ul></div>`;
}
function viewSlack() {
  const all = state.slack?.channels || [], q = slackQ.toLowerCase();
  const list = all.filter((c) => !q || c.name.includes(q) || c.topic.toLowerCase().includes(q));
  return `<h1>Slack channels</h1><p class="muted">Updates automatically when channels are created or archived. Public channels only. You'll need to be in the Slack workspace to open them.</p>
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

function render() {
  if (!state.user || state.pending) return;
  const [r, arg] = (location.hash.slice(1) || "home").split("/");
  const views = { home: viewHome, teams: () => viewTeams(arg), projects: () => viewProjects(arg), notes: viewNotes, calendar: viewCalendar, requests: viewRequests, messages: () => viewMessages(arg), drive: viewDrive, people: viewPeople, profile: viewProfile, slack: viewSlack };
  if (r === "drive" && drv.need && drive.connected()) { drv.need = false; loadDrive(false); }
  if ((r === "slack" || r === "teams") && state.slack === null && !state.slackLoading) loadSlack();
  const keep = document.activeElement?.id, dmv = $("#dmtext")?.value;
  $("#view").innerHTML = (views[r] || viewHome)();
  const u = unreadCount();
  $("#nav").innerHTML = ROUTES.filter(([k]) => (k !== "people" || state.officer) && (k !== "slack" || C.slack?.endpoint || !fb.configured)).map(([k, l]) => `<a href="#${k}" class="${k === r ? "on" : ""}">${l}${k === "messages" && u ? ` <span class="badge">${u}</span>` : ""}</a>`).join("");
  if (dmv && $("#dmtext")) $("#dmtext").value = dmv;
  const th = $("#thread"); if (th) th.scrollTop = th.scrollHeight;
  if (keep && $("#" + keep)) { const el = $("#" + keep); el.focus?.(); if (el.setSelectionRange && el.type === "text") el.setSelectionRange(99, 99); }
  $("#who").innerHTML = `<span class="muted">${esc(state.user.email)}${state.officer ? " · officer" : ""}</span><button class="btn sm" id="out">Sign out</button>`;
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
  if (a.startsWith("sms-")) return smsAction(a, b);
  if (a.startsWith("proj-")) return projAction(a, b);
  if (a === "del" && confirm("Delete this item?")) await fb.removeItem(b.dataset.c, b.dataset.id);
  if (a === "tog") {
    const p = state.projects.find((x) => x.id === b.dataset.id), i = Number(b.dataset.i), d = new Set(p.done || []);
    d.has(i) ? d.delete(i) : d.add(i); await fb.updateItem("projects", p.id, { done: [...d] });
  }
  if (a === "addLink") openForm("Add a link", [{ name: "name", label: "Label", required: true, ph: "Trello board" }, { name: "url", label: "URL", type: "url", required: true }], (v) => fb.addItem("links", v));
  if (a === "addAnn") openForm("New announcement", [{ name: "title", label: "Title", required: true }, { name: "body", label: "Details", type: "textarea" }, { name: "pinned", label: "Pin to top", type: "check" }], (v) => fb.addItem("announcements", v));
  if (a === "addProj") openForm("New project", [{ name: "name", label: "Project / event name", required: true }, { name: "owner", label: "Owner team", type: "select", options: teamOpts() }, { name: "needsFrom", label: "Needs help from", type: "checks", options: teamOpts() }, { name: "due", label: "Due / event date (optional, leave blank for a folder-style project)", type: "date" }, { name: "trello", label: "Trello card or board URL", type: "url" }, { name: "drive", label: "Drive folder URL", type: "url" }], (v) => fb.addItem("projects", projData(v)));
  if (a === "addNote") openForm("Add meeting notes", noteFields(), (v) => fb.addItem("notes", v));
});
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

// ---------- boot ----------
fb.onAuth(async (user) => {
  if (!user) {
    $("#view").innerHTML = `<div class="hero"><h1>Sign in to continue</h1><p>Use your Google account.</p><button class="btn pri" id="in">Sign in with Google</button></div>`;
    $("#in").onclick = () => fb.signIn();
    return;
  }
  state.user = user;
  fb.upsertUser(user).catch(() => {});
  const role = await fb.getRole(user);
  try { state.sms = await fb.getItem("smsConsent", user.email.toLowerCase()); } catch { state.sms = null; }
  if (role === "pending") {
    state.pending = true;
    $("#nav").innerHTML = ""; $("#who").innerHTML = "";
    $("#view").innerHTML = `<div class="hero"><h1>Waiting for approval</h1><p>You're signed in as ${esc(user.email)}. An officer needs to approve your account before you can see the hub.</p><button class="btn pri" id="chk">Check again</button> <button class="btn" id="so">Sign out</button></div><div class="card" id="smscard" style="max-width:520px;margin:0 auto 40px"></div>`;
    $("#smscard").innerHTML = smsInner();
    $("#chk").onclick = () => location.reload();
    $("#so").onclick = async () => { await fb.signOutUser(); location.href = "index.html"; };
    return;
  }
  state.officer = role === "officer";
  fb.watchDMs(user.email.toLowerCase(), (d) => { state.messages = d; render(); });
  for (const c of ["announcements", "projects", "notes", "links"]) fb.watch(c, (d) => { state[c] = d; render(); });
  fb.watch("members", (d) => { state.members = d; rebuildDir(); render(); });
  fb.watch("officers", (d) => { state.officers = d; rebuildDir(); render(); });
  if (state.officer) fb.watch("users", (d) => { state.signups = d; render(); });
  if (state.officer) fb.watch("smsConsent", (d) => { state.smsList = d; render(); });
  render();
});
