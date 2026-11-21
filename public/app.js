(() => {
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = document.body.dataset.page, token = localStorage.getItem("token");
const publicPages = ["index", "login", "register"];
let me = null, socket = null;

function toast(m) { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500); }
async function api(path, { method = "GET", body, form } = {}) {
  const h = token ? { Authorization: "Bearer " + token } : {}; if (body) h["Content-Type"] = "application/json";
  const r = await fetch("/api" + path, { method, headers: h, body: form || (body && JSON.stringify(body)) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !publicPages.includes(page)) { localStorage.clear(); location.href = "login.html"; }
  if (!r.ok) throw new Error(d.message || "Request failed");
  return d;
}
const ago = (d) => new Date(d).toLocaleString();
const avatar = (u) => u && u.profilePicture ? `<img class="avatar" src="${esc(u.profilePicture)}" alt="">` : `<span class="avatar">${esc((u && u.name || "?")[0].toUpperCase())}</span>`;
const bind = (root, sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener("click", () => fn(el)));
const main = () => $("#main");
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };
const connBtn = (id, st) => st === "accepted" ? '<button class="btn sm" disabled>Connected ✓</button>' : st === "sent" ? '<button class="btn sm" disabled>Request sent</button>' : st === "incoming" ? `<button class="btn sm" data-c="${id}">Accept request</button>` : `<button class="btn sm" data-c="${id}">Connect</button>`;
const connMap = async () => { const d = await api("/connections"), m = {}; d.connections.forEach((c) => { if (!c.requester || !c.recipient) return; const mine = c.requester._id === me._id, other = mine ? c.recipient._id : c.requester._id; m[other] = c.status === "pending" ? (mine ? "sent" : "incoming") : c.status; }); return m; };
const doConnect = safe(async (b) => { b.disabled = true; try { const r = await api("/connections/" + b.dataset.c, { method: "POST" }); const st = (await connMap())[b.dataset.c]; if (st === "accepted") { b.textContent = "Connected ✓"; } else if (st === "sent") { b.textContent = "Request sent"; } else { b.disabled = false; toast("The request was not saved. Please try again."); return; } if (r.message) toast(r.message); } catch (e) { b.disabled = false; throw e; } });
const loadReco = safe(async () => {
  const box = $("#reco");
  box.innerHTML = '<p class="mut">Finding your best matches…</p>';
  const d = await api("/recommendations"), cm = await connMap();
  box.innerHTML = d.recommendations.map((r) => `<div class="card"><b>${esc(r.mentor.name)}</b><div class="mut">${esc(r.mentor.field)}</div><p>${esc(r.reason)}</p><div class="row">${connBtn(r.mentor.id, cm[r.mentor.id])}<a class="btn sm alt" href="messages.html?user=${r.mentor.id}">Message</a></div><div class="mut">${d.source === "ai" ? "AI-generated match" : "Keyword match"}</div></div>`).join("") || '<p class="mut">No matches yet. Add skills and interests to your profile, then refresh.</p>';
  bind(box, "[data-c]", doConnect);
});

// ---------- navbar + real-time notifications ----------
const NAV = [["dashboard", "Dashboard"], ["mentors", "Find People"], ["connections", "Connections"], ["feed", "Newsfeed"], ["messages", "Messages"], ["research", "Research"], ["events", "Events"], ["resources", "Resources"], ["chatbot", "AI Chat"]];
function renderNav() {
  const links = NAV.concat(me.role === "admin" ? [["admin", "Admin"]] : []).map(([p, l]) => `<a href="${p}.html" class="${p === page ? "on" : ""}">${l}</a>`).join("");
  const nav = document.createElement("header"); nav.className = "top";
  nav.innerHTML = `<a class="brand" href="dashboard.html">Kathgolap</a><nav class="links">${links}</nav><div class="right"><button class="bell" id="bell" aria-label="Notifications">🔔<span class="badge" id="badge">0</span></button><a href="profile.html" title="My profile">${avatar(me)}</a><button class="btn alt sm" id="out">Log out</button></div><div class="drop" id="drop"></div>`;
  document.body.prepend(nav);
  $("#out").onclick = () => { localStorage.clear(); location.href = "index.html"; };
  $("#bell").onclick = safe(async () => { $("#drop").classList.toggle("open"); await loadDrop(); });
  document.addEventListener("click", (e) => { if (!e.target.closest("#drop,#bell")) $("#drop").classList.remove("open"); });
  refreshBadge();
}
function setBadge(n) { const b = $("#badge"); b.textContent = n > 99 ? "99+" : n; b.style.display = n ? "flex" : "none"; }
async function refreshBadge() { const d = await api("/notifications"); setBadge(d.unread); return d; }
async function loadDrop() {
  const d = await api("/notifications"); setBadge(d.unread);
  $("#drop").innerHTML = `<div class="it row sp"><b>Notifications</b><span><button class="btn sm alt" id="all">Mark all read</button> <a href="notifications.html">See all</a></span></div>` +
    (d.notifications.slice(0, 8).map((n) => `<div class="it ${n.readAt ? "" : "unread"}">${esc(n.text)}<small>${ago(n.createdAt)}</small></div>`).join("") || `<div class="it mut">No notifications yet.</div>`);
  $("#all").onclick = safe(async () => { await api("/notifications/read-all", { method: "PATCH" }); loadDrop(); });
}
function connectSocket() {
  socket = io({ auth: { token } });
  socket.on("notification", (n) => { toast("🔔 " + n.text); refreshBadge().catch(() => {}); if ($("#drop.open")) loadDrop().catch(() => {}); document.dispatchEvent(new CustomEvent("notif")); });
  socket.on("new-message", (d) => document.dispatchEvent(new CustomEvent("newmsg", { detail: d.message })));
}

// ---------- pages ----------
const P = {};
P.index = () => { if (token) { $("#cta").innerHTML = `<a class="btn" href="dashboard.html">Open dashboard</a>`; } };

const authForm = (register) => {
  $("#f").onsubmit = async (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target));
    try { const d = await api(register ? "/auth/register" : "/auth/login", { method: "POST", body: b }); localStorage.setItem("token", d.token); location.href = "dashboard.html"; }
    catch (x) { $("#err").textContent = x.message; } };
};
P.login = () => authForm(false);
P.register = () => { const r = new URLSearchParams(location.search).get("role"); if (r === "mentor" || r === "student") $("#role").value = r; authForm(true); };

P.dashboard = safe(async () => {
  const [c, m, n, mentors] = await Promise.all([api("/connections"), api("/messages"), api("/notifications"), api("/users/mentors")]);
  const acc = c.connections.filter((x) => x.status === "accepted").length, pend = c.connections.filter((x) => x.status === "pending" && x.recipient._id === me._id).length;
  const done = ["bio", "university", "department", "field", "profilePicture"].filter((k) => me[k]).length * 20;
  main().innerHTML = `<h1>Welcome, ${esc(me.name)}</h1><div class="grid">
   <div class="card"><b>Profile ${done}% complete</b><p class="mut">${done < 100 ? "Add the missing details so others can find you." : "Looking great!"}</p><a class="btn sm" href="profile.html">Edit profile</a></div>
   <div class="card"><b>${acc}</b> connections<br><b>${pend}</b> requests waiting<br><a href="connections.html">Manage</a></div>
   <div class="card"><b>${n.unread}</b> unread notifications<br><b>${m.conversations.reduce((s, x) => s + x.unread, 0)}</b> unread messages<br><a href="messages.html">Open messages</a></div>
   <div class="card"><b>AI assistant</b><p class="mut">Ask study and research questions.</p><a class="btn sm" href="chatbot.html">Start chatting</a></div></div>
   <h2>Mentors to meet</h2><div class="grid">${mentors.mentors.slice(0, 6).map((u) => `<div class="card"><b>${esc(u.name)}</b><div class="mut">${esc(u.field)}</div></div>`).join("") || '<p class="mut">No mentors have registered yet.</p>'}</div>`;
     if (me.role === "student") {
    main().insertAdjacentHTML("beforeend", '<h2>Recommended for you</h2><div class="grid" id="reco"></div>');
    loadReco();
  }
});

P.mentors = safe(async () => {
  const who = me.role === "mentor" ? "students" : "mentors";
  const load = safe(async () => {
    const [d, cm] = await Promise.all([api(`/users/${who}?search=${encodeURIComponent($("#q").value)}`), connMap()]);
    $("#list").innerHTML = d[who].map((u) => `<div class="card"><b>${esc(u.name)}</b> <span class="tag">${esc(u.role)}</span><div class="mut">${esc(u.field)}</div><p>${esc(u.bio)}</p>${(u.skills || []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}<div class="row" style="margin-top:.6rem">${connBtn(u.id, cm[u.id])} <a class="btn sm alt" href="messages.html?user=${u.id}">Message</a></div></div>`).join("") || '<p class="mut">No results.</p>';
    bind($("#list"), "[data-c]", doConnect);
  });
  main().innerHTML = `<h1>Find ${who}</h1><input id="q" placeholder="Search by name, field or skill"><div class="grid" id="list"></div>`;
  $("#q").oninput = (() => { let t; return () => { clearTimeout(t); t = setTimeout(load, 300); }; })(); load();
});

P.connections = safe(async () => {
  const load = safe(async () => {
    const d = await api("/connections");
    $("#list").innerHTML = d.connections.map((c) => { const other = c.requester._id === me._id ? c.recipient : c.requester, incoming = c.recipient._id === me._id && c.status === "pending";
      return `<div class="card row sp"><div>${esc(other.name)} <span class="tag">${esc(other.role)}</span> <i class="mut">${c.status}${incoming ? "" : c.status === "pending" ? " (sent)" : ""}</i></div><div>${incoming ? `<button class="btn sm" data-s="accepted" data-id="${c._id}">Accept</button> <button class="btn sm alt" data-s="rejected" data-id="${c._id}">Reject</button>` : ""}${c.status === "accepted" ? `<a class="btn sm" href="messages.html?user=${other._id}">Message</a>` : ""}</div></div>`; }).join("") || '<p class="mut">No connections yet. Visit Find People.</p>';
    bind($("#list"), "[data-s]", safe(async (b) => { await api("/connections/" + b.dataset.id, { method: "PATCH", body: { status: b.dataset.s } }); load(); }));
  });
  main().innerHTML = `<h1>Connections</h1><div id="list"></div>`; load();
});

P.feed = safe(async () => {
  main().innerHTML = `<h1>Academic newsfeed</h1><form class="card" id="pf"><textarea name="text" rows="3" maxlength="2000" placeholder="Share an academic update…"></textarea><img id="pv" class="postimg" hidden alt="Preview"><div class="row sp"><label>📷 Add JPG picture <input type="file" id="img" accept="image/jpeg,.jpg,.jpeg" hidden></label><span class="mut" id="fn"></span><button class="btn">Post</button></div></form><div id="posts"></div>`;
  $("#img").onchange = () => { const f = $("#img").files[0]; if (!f) return; if (!/\.jpe?g$/i.test(f.name) || f.size > 3e6) { toast("Choose a JPG under 3 MB."); $("#img").value = ""; return; } $("#fn").textContent = f.name; $("#pv").src = URL.createObjectURL(f); $("#pv").hidden = false; };
  $("#pf").onsubmit = safe(async (e) => { e.preventDefault(); const fd = new FormData(); fd.append("text", e.target.text.value); const f = $("#img").files[0]; if (f) fd.append("image", f);
    await api("/posts", { method: "POST", form: fd }); e.target.reset(); $("#pv").hidden = true; $("#fn").textContent = ""; load(); });
  const load = safe(async () => {
    const d = await api("/posts");
    $("#posts").innerHTML = d.posts.map((p) => `<article class="card" data-p="${p.id}"><div class="row">${avatar(p.author)}<div><b>${esc(p.author?.name)}</b> <span class="tag">${esc(p.author?.role)}</span><div class="mut">${ago(p.createdAt)}</div></div></div><p>${esc(p.text)}</p>${p.image ? `<img class="postimg" src="${esc(p.image)}" alt="Post picture">` : ""}<div class="row" style="margin-top:.6rem"><button class="btn sm alt" data-l>${p.likedByMe ? "💗" : "🤍"} ${p.likesCount}</button><button class="btn sm alt" data-cm>Comments</button><button class="btn sm alt" data-rp>Report</button>${p.author?._id === me._id || me.role === "admin" ? `<button class="btn sm alt" data-d>Delete</button>` : ""}</div><div class="cbox"></div></article>`).join("") || '<p class="mut">No posts yet. Be the first!</p>';
    document.querySelectorAll("#posts article").forEach((a) => { const id = a.dataset.p;
      $("[data-l]", a).onclick = safe(async (e) => { const r = await api(`/posts/${id}/like`, { method: "POST" }); e.target.textContent = `${r.liked ? "💗" : "🤍"} ${r.likesCount}`; });
      $("[data-d]", a)?.addEventListener("click", safe(async () => { if (confirm("Delete this post?")) { await api("/posts/" + id, { method: "DELETE" }); load(); } }));
      $("[data-rp]", a).onclick = safe(async () => { const reason = prompt("Why are you reporting this post?"); if (reason) { await api("/reports", { method: "POST", body: { targetType: "post", targetId: id, reason } }); toast("Report sent. Thank you."); } });
      $("[data-cm]", a).onclick = safe(async () => { const box = $(".cbox", a); if (box.innerHTML) { box.innerHTML = ""; return; }
        const draw = async () => { const c = await api("/comments/" + id); box.innerHTML = c.comments.map((x) => `<p><b>${esc(x.author?.name)}</b> ${esc(x.text)}</p>`).join("") + `<div class="row"><input placeholder="Write a comment"><button class="btn sm">Send</button></div>`;
          $("button", box).onclick = safe(async () => { const t = $("input", box).value.trim(); if (t) { await api("/comments/" + id, { method: "POST", body: { text: t } }); draw(); } }); };
        await draw(); });
    });
  });
  load();
});

P.messages = safe(async () => {
  let current = new URLSearchParams(location.search).get("user"), people = new Map();
  main().innerHTML = `<h1>Messages</h1><div class="split"><div class="card" id="side"></div><div class="card chat"><div id="who" class="mut">Choose a conversation</div><div class="log" id="log"></div><form class="row" id="mf"><input name="t" placeholder="Type a message" autocomplete="off" style="flex:1;margin:0"><button class="btn">Send</button></form></div></div>`;
  const bubble = (m) => `<div class="msg ${m.sender._id === me._id ? "me" : "them"}">${esc(m.text)}<div style="font-size:.7rem;opacity:.7">${ago(m.createdAt)}</div></div>`;
  const side = safe(async () => {
    const [cv, cn] = await Promise.all([api("/messages"), api("/connections")]);
    people = new Map();
    cv.conversations.forEach((c) => c.user && people.set(c.user._id, { u: c.user, last: c.lastMessage, unread: c.unread }));
    cn.connections.filter((c) => c.status === "accepted").forEach((c) => { const o = c.requester._id === me._id ? c.recipient : c.requester; if (!people.has(o._id)) people.set(o._id, { u: o, last: "Say hello", unread: 0 }); });
    $("#side").innerHTML = [...people.values()].map((p) => `<div class="conv ${p.u._id === current ? "on" : ""}" data-u="${p.u._id}">${avatar(p.u)}<div><b>${esc(p.u.name)}</b>${p.unread ? ` <span class="tag">${p.unread} new</span>` : ""}<div class="mut">${esc((p.last || "").slice(0, 30))}</div></div></div>`).join("") || '<p class="mut">Connect with someone to start chatting.</p>';
    bind($("#side"), "[data-u]", (el) => { current = el.dataset.u; open(); });
  });
  const open = safe(async () => { if (!current) return; const d = await api("/messages/" + current); const u = people.get(current)?.u;
    $("#who").innerHTML = `<b>${esc(u?.name || "Conversation")}</b>`; $("#log").innerHTML = d.messages.map(bubble).join(""); $("#log").scrollTop = 1e9; side(); });
  $("#mf").onsubmit = safe(async (e) => { e.preventDefault(); const t = e.target.t.value.trim(); if (!t || !current) return; e.target.t.value = "";
    const d = await api("/messages", { method: "POST", body: { recipientId: current, text: t } }); $("#log").insertAdjacentHTML("beforeend", bubble(d.message)); $("#log").scrollTop = 1e9; side(); });
  document.addEventListener("newmsg", safe(async (e) => { if (e.detail.sender._id === current) { $("#log").insertAdjacentHTML("beforeend", bubble(e.detail)); $("#log").scrollTop = 1e9; await api("/messages/" + current); } side(); }));
  await side(); if (current) open();
});

P.chatbot = () => {
  const history = []; let cur = null, busy = false;
  main().innerHTML = `<h1>AI academic assistant</h1><p class="mut">Answers are AI-generated and may contain mistakes. Always verify references.</p><div class="card chat"><div class="log" id="log"><div class="msg bot">Hi ${esc(me.name.split(" ")[0])}! Ask me about studying, research ideas or academic writing.</div></div><div class="row" id="sg">${["Suggest 5 research topics in machine learning", "Explain p-values simply", "Make a 2-week study plan for databases", "Improve the tone of my abstract"].map((s) => `<button class="btn sm alt">${s}</button>`).join("")}</div><form class="row" id="cf"><input name="t" placeholder="Ask anything academic" autocomplete="off" maxlength="4000" style="flex:1;margin:.4rem 0"><button class="btn" id="go">Send</button></form></div>`;
  const add = (cls, t) => { const d = document.createElement("div"); d.className = "msg " + cls; d.textContent = t; $("#log").append(d); $("#log").scrollTop = 1e9; return d; };
  const send = (t) => { if (busy || !t.trim()) return; busy = true; $("#go").disabled = true; add("me", t); cur = add("bot", "…"); cur.dataset.raw = ""; socket.emit("chatbot:ask", { prompt: t, history: history.slice() }); history.push({ role: "user", text: t }); };
  $("#cf").onsubmit = (e) => { e.preventDefault(); const t = e.target.t.value; e.target.t.value = ""; send(t); };
  bind($("#sg"), "button", (b) => send(b.textContent));
  const end = () => { busy = false; $("#go").disabled = false; };
  socket.on("chatbot:chunk", ({ text }) => { cur.dataset.raw += text; cur.textContent = cur.dataset.raw; $("#log").scrollTop = 1e9; });
  socket.on("chatbot:done", () => { history.push({ role: "model", text: cur.dataset.raw }); cur.insertAdjacentHTML("beforeend", `<div class="mut">AI-generated</div>`); end(); });
  socket.on("chatbot:error", ({ message }) => { if (cur) { cur.textContent = message; cur.classList.add("err"); } history.pop(); end(); });
};

P.research = safe(async () => {
  main().innerHTML = `<h1>Research Hub</h1><form class="card" id="rf"><b>Start a project</b><input name="title" placeholder="Title" required maxlength="160"><textarea name="abstract" rows="3" placeholder="Abstract" required></textarea><input name="field" placeholder="Field"><input name="skills" placeholder="Skills wanted (comma separated)"><button class="btn">Create project</button></form><input id="q" placeholder="Search projects"><div id="list"></div>`;
  const load = safe(async () => {
    const d = await api("/research?search=" + encodeURIComponent($("#q").value));
    $("#list").innerHTML = d.projects.map((p) => { const mine = p.owner._id === me._id;
      return `<div class="card" data-id="${p._id}"><div class="row sp"><h3>${esc(p.title)}</h3><span class="tag">${esc(p.status)}</span></div><div class="mut">${esc(p.owner.name)} · ${esc(p.field)}</div><p>${esc(p.abstract)}</p>${(p.skills || []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}<p class="mut">Team: ${p.collaborators.map((c) => esc(c.name)).join(", ") || "none yet"}</p>
      ${mine ? (p.applications || []).filter((a) => a.status === "pending").map((a) => `<div class="row">${esc(a.user?.name)}: ${esc(a.message)} <button class="btn sm" data-ap="accepted" data-a="${a._id}">Accept</button><button class="btn sm alt" data-ap="rejected" data-a="${a._id}">Reject</button></div>`).join("") : `<button class="btn sm" data-apply>Ask to join</button>`}
      <h4>Discussion</h4>${p.discussions.map((x) => `<p><b>${esc(x.author?.name)}</b> ${esc(x.text)}</p>`).join("")}<div class="row"><input placeholder="Add to discussion"><button class="btn sm" data-ds>Post</button>${mine || me.role === "admin" ? `<button class="btn sm alt" data-del>Delete</button>` : ""}</div></div>`; }).join("") || '<p class="mut">No projects yet.</p>';
    document.querySelectorAll("#list .card").forEach((c) => { const id = c.dataset.id;
      $("[data-apply]", c)?.addEventListener("click", safe(async () => { const m = prompt("Tell the owner why you want to join:"); if (m) { await api(`/research/${id}/apply`, { method: "POST", body: { message: m } }); toast("Application sent."); } }));
      $("[data-ds]", c).onclick = safe(async () => { const t = $("input", c.querySelector(".row:last-child")).value.trim(); if (t) { await api(`/research/${id}/discuss`, { method: "POST", body: { text: t } }); load(); } });
      $("[data-del]", c)?.addEventListener("click", safe(async () => { if (confirm("Delete project?")) { await api("/research/" + id, { method: "DELETE" }); load(); } }));
      bind(c, "[data-ap]", safe(async (b) => { await api(`/research/${id}/applications/${b.dataset.a}`, { method: "PATCH", body: { status: b.dataset.ap } }); load(); })); });
  });
  $("#rf").onsubmit = safe(async (e) => { e.preventDefault(); const f = e.target; await api("/research", { method: "POST", body: { title: f.title.value, abstract: f.abstract.value, field: f.field.value, skills: f.skills.value.split(",").map((s) => s.trim()).filter(Boolean) } }); f.reset(); load(); });
  $("#q").oninput = (() => { let t; return () => { clearTimeout(t); t = setTimeout(load, 300); }; })(); load();
});

P.events = safe(async () => {
  main().innerHTML = `<h1>Events</h1><form class="card" id="ef"><b>Add an event</b><input name="title" placeholder="Title" required><textarea name="description" rows="2" placeholder="Description"></textarea><label>Starts at</label><input type="datetime-local" name="startsAt" required><input name="location" placeholder="Location (default Online)"><button class="btn">Create</button></form><div id="list"></div>`;
  const load = safe(async () => { const d = await api("/events");
    $("#list").innerHTML = d.events.map((v) => `<div class="card row sp"><div><b>${esc(v.title)}</b><div class="mut">${ago(v.startsAt)} · ${esc(v.location)} · by ${esc(v.createdBy?.name)}</div><p>${esc(v.description)}</p></div><div><button class="btn sm alt" data-i="${v._id}">⭐ ${v.interestedUsers.length}</button> ${v.createdBy?._id === me._id || me.role === "admin" ? `<button class="btn sm alt" data-x="${v._id}">Delete</button>` : ""}</div></div>`).join("") || '<p class="mut">No events yet.</p>';
    bind($("#list"), "[data-i]", safe(async (b) => { const r = await api(`/events/${b.dataset.i}/interested`, { method: "POST" }); b.textContent = "⭐ " + r.interestedCount; }));
    bind($("#list"), "[data-x]", safe(async (b) => { await api("/events/" + b.dataset.x, { method: "DELETE" }); load(); })); });
  $("#ef").onsubmit = safe(async (e) => { e.preventDefault(); const f = e.target; await api("/events", { method: "POST", body: { title: f.title.value, description: f.description.value, startsAt: new Date(f.startsAt.value).toISOString(), location: f.location.value || "Online" } }); f.reset(); load(); });
  load();
});

P.resources = safe(async () => {
  main().innerHTML = `<h1>Resources</h1><form class="card" id="rf"><b>Share a resource</b><input name="title" placeholder="Title" required><input name="url" type="url" placeholder="https://…" required><input name="description" placeholder="Short description"><button class="btn">Share</button></form><div id="list"></div>`;
  const load = safe(async () => { const d = await api("/resources");
    $("#list").innerHTML = d.resources.map((r) => `<div class="card row sp"><div><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(r.title)}</b></a><div class="mut">${esc(r.description)}</div></div>${r.createdBy === me._id || me.role === "admin" ? `<button class="btn sm alt" data-x="${r._id}">Delete</button>` : ""}</div>`).join("") || '<p class="mut">No resources yet.</p>';
    bind($("#list"), "[data-x]", safe(async (b) => { await api("/resources/" + b.dataset.x, { method: "DELETE" }); load(); })); });
  $("#rf").onsubmit = safe(async (e) => { e.preventDefault(); const f = e.target; await api("/resources", { method: "POST", body: { title: f.title.value, url: f.url.value, description: f.description.value } }); f.reset(); load(); });
  load();
});

P.profile = safe(async () => {
  const u = (await api("/profile/me")).user;
  main().innerHTML = `<h1>My profile</h1><form class="card" id="pf"><div class="row">${avatar(u)}<label>Change photo (JPG, PNG, WebP, max 2 MB)<input type="file" name="profilePicture" accept="image/jpeg,image/png,image/webp"></label></div>
  <p class="mut">${esc(u.email)} · <span class="tag">${esc(u.role)}</span></p>
  <label>Name</label><input name="name" value="${esc(u.name)}" required minlength="2">
  <label>University</label><input name="university" value="${esc(u.university)}">
  <label>Department</label><input name="department" value="${esc(u.department)}">
  <label>${u.role === "mentor" ? "Area of expertise" : "Field of study"}</label><input name="field" value="${esc(u.field)}">
  <label>Bio (max 600)</label><textarea name="bio" rows="4" maxlength="600">${esc(u.bio)}</textarea>
  <label>Skills (comma separated)</label><input name="skills" value="${esc((u.skills || []).join(", "))}">
  <label>Research interests (comma separated)</label><input name="researchInterests" value="${esc((u.researchInterests || []).join(", "))}">
  <p class="err" id="err"></p><button class="btn">Save changes</button></form>`;
  $("#pf").onsubmit = safe(async (e) => { e.preventDefault(); const f = e.target, fd = new FormData();
    ["name", "university", "department", "field", "bio"].forEach((k) => fd.append(k, f[k].value));
    ["skills", "researchInterests"].forEach((k) => fd.append(k, JSON.stringify(f[k].value.split(",").map((s) => s.trim()).filter(Boolean))));
    if (f.profilePicture.files[0]) fd.append("profilePicture", f.profilePicture.files[0]);
    await api("/profile/me", { method: "PUT", form: fd }); toast("Profile saved."); setTimeout(() => location.reload(), 600); });
});

P.notifications = safe(async () => {
  main().innerHTML = `<div class="row sp"><h1>Notifications</h1><button class="btn alt" id="all">Mark all as read</button></div><div id="list"></div>`;
  const load = safe(async () => { const d = await api("/notifications"); setBadge(d.unread);
    $("#list").innerHTML = d.notifications.map((n) => `<div class="card row sp" style="${n.readAt ? "" : "border-color:var(--yel)"}"><div>${esc(n.text)}<div class="mut">${ago(n.createdAt)}</div></div>${n.readAt ? "" : `<button class="btn sm alt" data-r="${n._id}">Mark read</button>`}</div>`).join("") || '<p class="mut">Nothing here yet.</p>';
    bind($("#list"), "[data-r]", safe(async (b) => { await api(`/notifications/${b.dataset.r}/read`, { method: "PATCH" }); load(); })); });
  $("#all").onclick = safe(async () => { await api("/notifications/read-all", { method: "PATCH" }); load(); });
  document.addEventListener("notif", load); load();
});

P.admin = safe(async () => {
  if (me.role !== "admin") { main().innerHTML = "<p class='err'>Administrators only.</p>"; return; }
  const [s, u, r] = await Promise.all([api("/admin/stats"), api("/admin/users"), api("/reports")]);
  const stats = s.stats || s;
  main().innerHTML = `<h1>Administration</h1><div class="grid">${Object.entries(stats).filter(([, v]) => typeof v !== "object").map(([k, v]) => `<div class="card"><b>${esc(v)}</b><div class="mut">${esc(k)}</div></div>`).join("")}</div>
  <h2>Reports</h2><div id="rep">${r.reports.map((x) => `<div class="card row sp"><div><span class="tag">${esc(x.targetType)}</span> ${esc(x.reason)}<div class="mut">by ${esc(x.reporter?.name)} · ${esc(x.status)}</div></div><div>${x.targetType !== "user" ? `<button class="btn sm" data-rm="${x.targetType}/${x.targetId}">Remove content</button> ` : ""}<button class="btn sm alt" data-rs="${x._id}">Resolve</button></div></div>`).join("") || '<p class="mut">No reports.</p>'}</div>
  <h2>Users</h2><div id="usr">${u.users.map((x) => `<div class="card row sp"><div>${esc(x.name)} <span class="tag">${esc(x.role)}</span> <span class="mut">${esc(x.email)}</span></div>${x._id === me._id ? "" : `<button class="btn sm alt" data-u="${x._id}" data-a="${x.isActive}">${x.isActive ? "Suspend" : "Reactivate"}</button>`}</div>`).join("")}</div>`;
  bind(main(), "[data-u]", safe(async (b) => { await api(`/admin/users/${b.dataset.u}/status`, { method: "PATCH", body: { isActive: b.dataset.a !== "true" } }); P.admin(); }));
  bind(main(), "[data-rs]", safe(async (b) => { await api("/reports/" + b.dataset.rs, { method: "PATCH", body: { status: "resolved" } }); P.admin(); }));
  bind(main(), "[data-rm]", safe(async (b) => { if (confirm("Remove this content?")) { await api("/admin/content/" + b.dataset.rm, { method: "DELETE" }); toast("Removed."); } }));
});

// ---------- boot ----------
(async () => {
  if (!publicPages.includes(page)) {
    if (!token) { location.href = "login.html"; return; }
    try { me = (await api("/profile/me")).user; } catch (e) { return; }
    renderNav(); connectSocket();
  }
  P[page] && P[page]();
})();
})();
