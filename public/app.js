'use strict';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S = null, view = 'dashboard', houseFilter = 'all', stageFilter = 'all', query = '';

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
async function refresh() { S = await api('/state'); render(); }
const houseChip = (h) => `<span class="chip ${h}">${h === 'windsor' ? 'Windsor' : 'Tudor'}</span>`;
const fmtDate = (d) => d ? new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
function dueText(n) { return n < 0 ? `${-n}d overdue` : n === 0 ? 'due today' : n === 1 ? 'due tomorrow' : `in ${n} days`; }
const levelChip = (u) => ({ overdue: '<span class="chip overdue">OVERDUE</span>', alerting: '<span class="chip alerting">Daily alerts</span>', reminder: '<span class="chip reminder">Reminder sent</span>' }[u.level] || '');
const visible = () => S.candidates.filter((c) => (houseFilter === 'all' || c.house === houseFilter) && (!query || (c.name + c.className).toLowerCase().includes(query.toLowerCase())));

function render() {
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  const clock = $('#clock');
  clock.className = 'clock' + (S.simulated ? ' sim' : '');
  clock.textContent = (S.simulated ? '⏱ Simulated date: ' : '📅 Today: ') + fmtDate(S.today);
  ({ dashboard, candidates, alerts, settings })[view]();
}

// ---------- Dashboard ----------
function dashboard() {
  const list = visible().filter((c) => c.task);
  const act = list.filter((c) => ['overdue', 'alerting'].includes(c.urgency.level));
  const all = visible();
  const stat = (n, l, cls = '', go = '') => `<div class="stat ${cls}" ${go ? `data-go="${go}"` : ''}><b>${n}</b><span>${l}</span></div>`;
  const groups = [['promotion', 'Step 2 → Step 3', '🎓'], ['classification', 'T2 / T3 classification', '🏷️'], ['review', '6-month Step 3 review', '⚖️']];
  $('#app').innerHTML = `
    <div class="row"><div class="grow"><h2>Dashboard</h2><span class="muted">Decisions awaiting action, sorted by due date.</span></div>
      <div class="tabs" id="htabs">${tab('all', 'Both houses')}${tab('windsor', 'Windsor')}${tab('tudor', 'Tudor')}</div>
      <button class="btn primary" id="runNow">🔔 Run alerts now</button></div>
    <div class="stats">
      ${stat(act.length, 'Awaiting decision now', act.length ? 'hot' : '')}
      ${stat(list.filter((c) => c.urgency.level === 'overdue').length, 'Overdue', 'hot')}
      ${stat(list.filter((c) => c.urgency.level === 'reminder').length, 'Reminders sent', 'warm')}
      ${stat(all.filter((c) => c.step === 2 && c.status === 'active').length, 'In Step 2')}
      ${stat(all.filter((c) => c.step === 3 && c.status === 'active').length, 'In Step 3')}
      ${stat(all.filter((c) => c.classification === 'T2' && c.status === 'active').length + ' / ' + all.filter((c) => c.classification === 'T3' && c.status === 'active').length, 'T2 / T3')}
    </div>
    ${S.mode.email === 'simulated' || S.mode.sms === 'simulated' ? `<div class="notice">Demo delivery mode: ${S.mode.email === 'simulated' ? 'email' : ''}${S.mode.email === 'simulated' && S.mode.sms === 'simulated' ? ' and ' : ''}${S.mode.sms === 'simulated' ? 'SMS' : ''} messages are recorded in the Alert log instead of being sent. See <b>Settings</b> to connect SMTP / Twilio.</div>` : ''}
    <div class="cols">${groups.map(([k, label, icon]) => {
      const items = list.filter((c) => c.task.kind === k).sort((a, b) => (a.task.due > b.task.due ? 1 : -1));
      return `<section class="panel"><h3><span>${icon} ${label}</span><span class="muted">${items.length}</span></h3>
        ${items.map(card).join('') || '<div class="empty">Nothing pending 🎉</div>'}</section>`;
    }).join('')}</div>`;
  bindCommon();
}
const tab = (k, l) => `<button data-house="${k}" class="${houseFilter === k ? 'on' : ''}">${l}</button>`;
function card(c) {
  const t = c.task;
  const when = `${t.label} · ${fmtDate(t.due)}`;
  return `<div class="item ${c.urgency.level}" data-id="${c.id}">
    <div class="row"><span class="name grow">${esc(c.name)}</span>${houseChip(c.house)}</div>
    <div class="meta">${esc(c.className)} · ${esc(c.stage)}</div>
    <div class="meta">${when} · <b>${dueText(c.urgency.daysLeft)}</b> ${levelChip(c.urgency)}</div>
    <div class="actions">${t.options.map((o) => `<button class="btn sm ${o.tone}" data-decide="${c.id}" data-opt="${o.id}">${esc(o.label)}</button>`).join('')}
    <button class="btn sm" data-open="${c.id}">Details</button></div></div>`;
}

// ---------- Candidates ----------
function candidates() {
  const stages = [['all', 'All'], ['Step 2', 'Step 2'], ['Step 3', 'Step 3'], ['ended', 'Ended']];
  let rows = visible().filter((c) => stageFilter === 'all' || (stageFilter === 'ended' ? c.status !== 'active' : c.status === 'active' && c.stage.startsWith(stageFilter)));
  rows.sort((a, b) => ((a.task?.due || '9') > (b.task?.due || '9') ? 1 : -1));
  $('#app').innerHTML = `
    <div class="row"><h2 class="grow">Candidates</h2><input id="q" placeholder="Search name or class…" value="${esc(query)}" style="max-width:240px"><button class="btn primary" id="add">＋ Add candidate</button></div>
    <div class="row"><div class="tabs" id="htabs">${tab('all', 'Both houses')}${tab('windsor', 'Windsor')}${tab('tudor', 'Tudor')}</div>
      <div class="tabs" id="stabs">${stages.map(([k, l]) => `<button data-stage="${k}" class="${stageFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="panel"><table><thead><tr><th>Name</th><th>House</th><th class="hide-sm">Class</th><th>Stage</th><th>Next decision</th><th class="hide-sm">Days in programme</th></tr></thead><tbody>
    ${rows.map((c) => `<tr data-open="${c.id}"><td><b>${esc(c.name)}</b></td><td>${houseChip(c.house)}</td><td class="hide-sm">${esc(c.className)}</td>
      <td>${c.status !== 'active' ? `<span class="chip ${c.status}">${c.status}</span>` : esc(c.stage)}</td>
      <td>${c.task ? `${esc(c.task.label)}<br><span class="muted">${fmtDate(c.task.due)} · ${dueText(c.urgency.daysLeft)}</span> ${levelChip(c.urgency)}` : '—'}</td>
      <td class="hide-sm">${c.daysInProgram}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No candidates match.</td></tr>'}
    </tbody></table></div>`;
  $('#q').oninput = (e) => { query = e.target.value; const pos = e.target.selectionStart; candidates(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
  document.querySelectorAll('[data-stage]').forEach((b) => b.onclick = () => { stageFilter = b.dataset.stage; candidates(); });
  $('#add').onclick = addDialog;
  bindCommon();
}

function addDialog() {
  const d = $('#dlg');
  const info = {};
  const close = '<button type="button" class="btn sm" id="x">✕</button>';
  const step1 = () => {
    d.innerHTML = `<form class="dlg"><div class="dlg-head"><h2>Add candidate <span class="muted">· 1 of 2</span></h2>${close}</div>
      <div class="form" style="margin-top:14px">
      <label class="field">Full name<input name="name" required value="${esc(info.name || '')}"></label>
      <label class="field">House<select name="house"><option value="windsor">House of Windsor</option><option value="tudor" ${info.house === 'tudor' ? 'selected' : ''}>House of Tudor</option></select></label>
      <label class="field">Class<input name="className" placeholder="e.g. Class 14A" value="${esc(info.className || '')}"></label></div>
      <div class="actions" style="margin-top:16px"><button class="btn primary">Next →</button></div></form>`;
    $('#x', d).onclick = () => d.close();
    $('form', d).onsubmit = (e) => { e.preventDefault(); Object.assign(info, Object.fromEntries(new FormData(e.target))); step2(); };
  };
  const step2 = () => {
    d.innerHTML = `<form class="dlg"><div class="dlg-head"><h2>Enrolment details <span class="muted">· 2 of 2</span></h2>${close}</div>
      <p style="margin:10px 0 0"><b>${esc(info.name)}</b> ${houseChip(info.house)} — when were they enrolled, and which step are they on?</p>
      <div class="form" style="margin-top:14px">
      <label class="field">Date enrolled (Step 2 admission)<input type="date" name="admittedOn" required max="${S.today}" value="${esc(info.admittedOn || '')}"></label>
      <label class="field">Current step<select name="step"><option value="2">Step 2</option><option value="3" ${info.step === '3' ? 'selected' : ''}>Step 3</option></select></label>
      <label class="field s3" hidden>Date promoted to Step 3<input type="date" name="promotedOn" max="${S.today}" value="${esc(info.promotedOn || '')}"></label>
      <label class="field s3" hidden>T2 / T3 classification<select name="classification"><option value="">Not yet classified</option><option>T2</option><option>T3</option></select></label></div>
      <p class="muted" id="preview"></p>
      <div class="actions" style="margin-top:12px"><button type="button" class="btn" id="back">← Back</button><button class="btn primary">Add candidate</button></div></form>`;
    const f = $('form', d);
    const iso = (dt) => dt.toISOString().slice(0, 10);
    const upd = () => {
      const s3 = f.step.value === '3';
      f.querySelectorAll('.s3').forEach((e) => { e.hidden = !s3; });
      f.promotedOn.required = s3;
      const a = f.admittedOn.value;
      if (a) f.promotedOn.min = a;
      const u = (n, m) => { const t = new Date(a + 'T00:00:00Z'); if (m) t.setUTCMonth(t.getUTCMonth() + n); else t.setUTCDate(t.getUTCDate() + n); return fmtDate(iso(t)); };
      $('#preview').textContent = !a ? '' : s3 ? `T2/T3 classification due ${u(3, true)}.` : `Eligible for Step 3 on ${u(S.rules.promotionDays)}; alerts start ${u(S.rules.promotionDays - S.rules.promotionLeadDays)}.`;
    };
    f.oninput = upd; upd();
    $('#x', d).onclick = () => d.close();
    $('#back', d).onclick = () => { Object.assign(info, Object.fromEntries(new FormData(f))); step1(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/candidates', 'POST', { ...info, ...Object.fromEntries(new FormData(f)) }); d.close(); toast(`${info.name} added`); refresh(); }
      catch (er) { toast(er.message); }
    };
  };
  step1();
  d.showModal();
}

function detail(id) {
  const c = S.candidates.find((x) => x.id === id); if (!c) return;
  const d = $('#dlg');
  const pct = c.promotedOn && c.task ? Math.min(100, Math.max(0, 100 * c.daysInStep3 / 183)) : 0;
  d.innerHTML = `<div class="dlg"><div class="dlg-head"><div><h2>${esc(c.name)}</h2><div class="meta muted">${houseChip(c.house)} ${esc(c.className)} · ${esc(c.stage)}</div></div><button class="btn sm" id="x">✕</button></div>
    ${c.task ? `<div class="item ${c.urgency.level}" style="margin-top:14px"><b>${esc(c.task.label)}</b> — ${fmtDate(c.task.due)} (${dueText(c.urgency.daysLeft)}) ${levelChip(c.urgency)}
      <div class="actions">${c.task.options.map((o) => `<button class="btn sm ${o.tone}" data-decide="${c.id}" data-opt="${o.id}">${esc(o.label)}</button>`).join('')}</div></div>` : `<p class="muted">No open decisions.</p>`}
    <div class="row muted" style="margin-top:10px"><span>Admitted ${fmtDate(c.admittedOn)}</span><span>${c.promotedOn ? 'Promoted ' + fmtDate(c.promotedOn) : ''}</span>${c.classification ? `<span class="chip ${c.classification}">${c.classification}</span>` : ''}</div>
    <ul class="timeline">${c.timeline.map((t, i, a) => `<li class="${t.done ? 'done' : (a.findIndex((x) => !x.done) === i ? 'now' : '')}"><b>${fmtDate(t.date)}</b><br>${esc(t.label)}</li>`).join('')}</ul>
    <div class="actions"><button class="btn sm stop" id="del">Delete candidate</button></div></div>`;
  $('#x', d).onclick = () => d.close();
  $('#del', d).onclick = async () => { if (confirm(`Delete ${c.name}? This cannot be undone.`)) { await api('/candidates/' + c.id, 'DELETE'); d.close(); toast('Deleted'); refresh(); } };
  d.querySelectorAll('[data-decide]').forEach((b) => b.onclick = () => decideDialog(c, b.dataset.opt));
  d.showModal();
}

function decideDialog(c, optId) {
  const opt = c.task.options.find((o) => o.id === optId);
  const d = $('#dlg');
  const needsDate = c.task.kind === 'promotion' && optId === 'promote';
  d.innerHTML = `<div class="dlg"><h2>Confirm decision</h2><p><b>${esc(c.name)}</b> — ${esc(c.task.label)}</p>
    <p style="font-size:18px">${esc(opt.label)}?</p>
    ${needsDate ? `<label class="field">Promotion date (recorded for the 3-month and 6-month calculations)<input type="date" id="pd" value="${S.today}" min="${c.admittedOn}"></label>` : ''}
    <div class="actions" style="margin-top:16px"><button class="btn ${opt.tone}" id="ok">Confirm</button><button class="btn" id="no">Cancel</button></div></div>`;
  $('#no', d).onclick = () => d.close();
  $('#ok', d).onclick = async () => {
    try { await api(`/candidates/${c.id}/decide`, 'POST', { kind: c.task.kind, option: optId, date: needsDate ? $('#pd', d).value : undefined }); d.close(); toast(`✓ ${c.name}: ${opt.label}`); refresh(); } catch (e) { toast(e.message); }
  };
  if (!d.open) d.showModal();
}

// ---------- Alerts ----------
async function alerts() {
  const list = await api('/alerts');
  const ic = { email: '✉️', sms: '💬', none: '⚠️' };
  $('#app').innerHTML = `<div class="row"><h2 class="grow">Alert log</h2><span class="muted">${list.length} most recent</span></div>
    <p class="muted">Every email/SMS the system sends (or would send in demo mode), including the one-click decision links.</p>
    <div class="panel"><table><thead><tr><th>Sent for</th><th></th><th>Candidate</th><th>Message</th><th>Status</th></tr></thead><tbody>
    ${list.map((a) => `<tr data-alert="${a.id}"><td>${fmtDate(a.date)}</td><td>${ic[a.channel] || ''}</td><td><b>${esc(a.candidateName)}</b><br>${houseChip(a.house)}</td>
      <td>${esc(a.subject)}<br><span class="muted">to ${esc(a.to || '—')}</span></td><td><span class="chip ${a.status === 'failed' ? 'overdue' : ''}">${esc(a.status)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No alerts yet. Add a house contact in Settings and press “Run alerts now”.</td></tr>'}
    </tbody></table></div>`;
  document.querySelectorAll('[data-alert]').forEach((r) => r.onclick = () => {
    const a = list.find((x) => x.id === r.dataset.alert); const d = $('#dlg');
    d.innerHTML = `<div class="dlg"><div class="dlg-head"><h3>${esc(a.subject)}</h3><button class="btn sm" id="x">✕</button></div><p class="muted">${esc(a.channel)} → ${esc(a.to || '—')} · ${esc(a.status)} ${esc(a.error || '')}</p><div class="msg">${esc(a.body)}</div>
      <div class="actions">${(a.links || []).map((l) => `<a class="btn sm" target="_blank" href="${esc(l.url)}">Open: ${esc(l.label)}</a>`).join('')}</div></div>`;
    $('#x', d).onclick = () => d.close(); d.showModal();
  });
}

// ---------- Settings ----------
function settings() {
  const s = S.settings;
  const h = (k, n) => `<section class="panel"><h3>${houseChip(k)} ${n}</h3>
    <label class="field">Alert email(s) — comma separated<input id="${k}-email" value="${esc(s.houses[k].email)}" placeholder="manager@example.com"></label><br>
    <label class="field">Alert phone(s) for SMS — international format<input id="${k}-phone" value="${esc(s.houses[k].phone)}" placeholder="+447700900123"></label></section>`;
  $('#app').innerHTML = `<h2>Settings</h2><p class="muted">Each house’s alerts go to its own email and phone number.</p>
    <div class="cols">${h('windsor', 'House of Windsor')}${h('tudor', 'House of Tudor')}
    <section class="panel"><h3>Schedule</h3><label class="field">Daily send hour (server time, 0–23)<input type="number" min="0" max="23" id="hour" value="${s.sendHour}"></label><br>
      <label class="field"><input type="checkbox" id="auto" ${s.autoRun ? 'checked' : ''} style="width:auto"> Send alerts automatically every day</label>
      <p class="muted">Delivery: email <b>${S.mode.email}</b>, SMS <b>${S.mode.sms}</b>.<br>Set <code>SMTP_URL</code> for email and <code>TWILIO_SID</code>, <code>TWILIO_TOKEN</code>, <code>TWILIO_FROM</code> for SMS; set <code>BASE_URL</code> to your public address so links work from phones.</p></section>
    <section class="panel"><h3>⏱ Time travel (testing)</h3><p class="muted">Simulate a different “today” to watch reminders and daily alerts fire.</p>
      <div class="row"><input type="date" id="sim" value="${s.simulatedToday || ''}" style="max-width:170px"><button class="btn" data-adv="1">+1 day</button><button class="btn" data-adv="7">+7 days</button><button class="btn" data-adv="30">+30</button></div>
      <div class="actions"><button class="btn" id="simclear">Back to real date</button></div></section>
    <section class="panel"><h3>Demo data</h3><div class="actions"><button class="btn" id="seed">Add sample candidates</button><button class="btn stop" id="reset">Clear all candidates &amp; alerts</button></div></section></div>
    <div class="actions" style="margin-top:16px"><button class="btn primary" id="save">Save settings</button></div>`;
  const save = async (extra = {}) => { S = await api('/settings', 'PUT', { houses: { windsor: { email: $('#windsor-email').value, phone: $('#windsor-phone').value }, tudor: { email: $('#tudor-email').value, phone: $('#tudor-phone').value } }, sendHour: $('#hour').value, autoRun: $('#auto').checked, ...extra }); render(); };
  $('#save').onclick = async () => { try { await save(); toast('Settings saved'); } catch (e) { toast(e.message); } };
  document.querySelectorAll('[data-adv]').forEach((b) => b.onclick = async () => { const base = new Date((S.today) + 'T00:00:00Z'); base.setUTCDate(base.getUTCDate() + Number(b.dataset.adv)); await save({ simulatedToday: base.toISOString().slice(0, 10) }); toast('Date advanced — press “Run alerts now” on the dashboard'); });
  $('#sim').onchange = (e) => save({ simulatedToday: e.target.value });
  $('#simclear').onclick = () => save({ simulatedToday: null });
  $('#seed').onclick = async () => { S = await api('/seed', 'POST'); toast('Sample candidates added'); render(); };
  $('#reset').onclick = async () => { if (confirm('Delete ALL candidates and alert history?')) { S = await api('/reset', 'POST'); toast('Cleared'); render(); } };
}

// ---------- shared bindings ----------
function bindCommon() {
  document.querySelectorAll('#htabs [data-house]').forEach((b) => b.onclick = () => { houseFilter = b.dataset.house; render(); });
  document.querySelectorAll('[data-decide]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); decideDialog(S.candidates.find((c) => c.id === b.dataset.decide), b.dataset.opt); });
  document.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => detail(b.dataset.open));
  document.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { view = b.dataset.go; render(); });
  const run = $('#runNow');
  if (run) run.onclick = async () => {
    run.disabled = true;
    try { const r = await api('/run', 'POST'); S = r.state; toast(r.sent.length ? `Sent ${r.sent.length} alert(s) — see Alert log` : 'No new alerts due today'); } catch (e) { toast(e.message); }
    run.disabled = false; render();
  };
}
document.querySelectorAll('#nav button').forEach((b) => b.onclick = () => { view = b.dataset.view; render(); });
refresh();
