'use strict';
const store = require('./store');
const scheduler = require('./scheduler');
const notify = require('./notify');
const { currentTask, urgency, KINDS, RULES } = require('./rules');
const { decide } = require('./decisions');
const { isValid, diffDays, addMonths, addDays } = require('./dates');
const { seed } = require('./seed');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const isProd = () => process.env.NODE_ENV === 'production' || store.onNetlify();

// Transport-neutral response helper: handlers return { code, type, body }.
const send = (_res, code, body, type = 'application/json') => ({ code, type, body: type === 'application/json' ? JSON.stringify(body) : body });
const parseJson = (raw) => { try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error('Bad JSON'); } };

function enrich(c, today) {
  const task = currentTask(c);
  const u = urgency(task, today);
  let stage = c.status !== 'active' ? c.status : c.step === 2 ? 'Step 2' : c.classification ? `Step 3 · ${c.classification}` : 'Step 3 · unclassified';
  return { ...c, stage, task: task && { kind: task.kind, label: task.label, due: task.due, dailyFrom: task.dailyFrom, reminderOn: task.reminderOn, options: task.options, cycle: task.cycle }, urgency: u,
    daysInProgram: diffDays(today, c.admittedOn), daysInStep3: c.promotedOn ? diffDays(today, c.promotedOn) : null, timeline: timeline(c, today) };
}

function timeline(c, today) {
  const t = [{ date: c.admittedOn, label: 'Admitted to Step 2', done: true }];
  const elig = addDays(c.admittedOn, RULES.promotionDays);
  t.push({ date: addDays(elig, -RULES.promotionLeadDays), label: 'Promotion alerts begin (daily until decided)', done: today >= addDays(elig, -RULES.promotionLeadDays) });
  t.push({ date: elig, label: 'Eligible for Step 3', done: c.step === 3 || c.status === 'discharged' });
  if (c.promotedOn) {
    t.push({ date: c.promotedOn, label: 'Promoted to Step 3', done: true });
    const cl = addMonths(c.admittedOn, RULES.classifyMonths);
    t.push({ date: addDays(cl, -RULES.classifyReminderDays), label: 'T2/T3 reminder (2 weeks before)', done: today >= addDays(cl, -RULES.classifyReminderDays) });
    t.push({ date: cl, label: c.classification ? `Classified ${c.classification}${c.classifiedOn ? ' on ' + c.classifiedOn : ''}` : 'T2/T3 classification due (daily alerts final week)', done: !!c.classification });
    const cycles = c.reviewCycle || 1;
    for (let i = 1; i <= cycles; i++) {
      const due = addMonths(c.promotedOn, RULES.reviewMonths * i);
      t.push({ date: addDays(due, -RULES.reviewReminderDays), label: `Review #${i} reminder (2 weeks before)`, done: today >= addDays(due, -RULES.reviewReminderDays) });
      t.push({ date: due, label: `6-month review #${i} due — continue or evict`, done: i < cycles || c.status === 'evicted' });
    }
  }
  if (c.status !== 'active') t.push({ date: c.endedOn, label: c.status === 'evicted' ? 'Evicted from Step 3' : 'Discharged', done: true });
  return t.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
}

function state() {
  const db = store.get(); const today = scheduler.today();
  return { today, realToday: require('./dates').todayReal(), simulated: !!db.settings.simulatedToday, settings: db.settings, mode: notify.mode(),
    houses: store.HOUSES, rules: RULES, kinds: KINDS, candidates: db.candidates.map((c) => enrich(c, today)) };
}

function findTask(token) {
  const db = store.get();
  for (const [k, rec] of Object.entries(db.tasks)) {
    if (rec.token !== token) continue;
    const [cid, taskKey] = k.split('|');
    const c = db.candidates.find((x) => x.id === cid);
    return c ? { c, taskKey } : null;
  }
  return null;
}

// ---- Public click-to-decide pages ------------------------------------------------------
function page(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/style.css"></head><body class="decide-body"><main class="decide-card">${inner}</main></body></html>`;
}

function decidePage(req, res, token, option, method) {  // req = { rawBody }
  const hit = findTask(token);
  const brand = '<div class="brand-mark">⚜</div>';
  if (!hit) return send(res, 404, page('Link not found', `${brand}<h1>Link not found</h1><p>This decision link is invalid.</p>`), 'text/html; charset=utf-8');
  const { c, taskKey } = hit;
  const task = currentTask(c);
  const house = store.HOUSES[c.house];
  const stale = !task || task.key !== taskKey;
  if (stale) {
    const last = c.history[c.history.length - 1];
    return send(res, 200, page('Already decided', `${brand}<h1>Already recorded ✓</h1><p><b>${esc(c.name)}</b> — this decision has already been made${last ? `: <b>${esc(last.label)}</b> on ${esc(last.date)}` : ''}.</p><p class="muted">No further alerts will be sent for it.</p>`), 'text/html; charset=utf-8');
  }
  const opt = task.options.find((o) => o.id === option);
  if (!opt) return send(res, 404, page('Not found', `${brand}<h1>Unknown option</h1>`), 'text/html; charset=utf-8');

  if (method === 'POST') {
    return Promise.resolve(Object.fromEntries(new URLSearchParams(req.rawBody || ''))).then((form) => {
      const r = decide(c, task.kind, option, { today: scheduler.today(), date: form.date || undefined, via: 'link' });
      if (!r.ok) return send(res, 400, page('Error', `${brand}<h1>Couldn't record</h1><p>${esc(r.error)}</p>`), 'text/html; charset=utf-8');
      const extra = task.kind === 'promotion' && option === 'promote' ? `<p>Promotion date noted: <b>${esc(c.promotedOn)}</b>. The T2/T3 classification is due ${esc(addMonths(c.admittedOn, RULES.classifyMonths))} and the first 6‑month review ${esc(addMonths(c.promotedOn, RULES.reviewMonths))}.</p>` : '';
      return send(res, 200, page('Recorded', `${brand}<h1>Recorded ✓</h1><p><b>${esc(c.name)}</b> — ${esc(r.label)}.</p>${extra}<p class="muted">Alerts for this decision have stopped. You can close this page.</p>`), 'text/html; charset=utf-8');
    });
  }
  const dateField = task.kind === 'promotion' && option === 'promote'
    ? `<label class="field">Promotion date<input type="date" name="date" value="${esc(scheduler.today())}" min="${esc(c.admittedOn)}"></label>` : '';
  send(res, 200, page('Confirm decision', `${brand}<p class="eyebrow">${esc(house)} · ${esc(c.className)}</p><h1>${esc(c.name)}</h1>
    <p>${esc(task.label)} · due <b>${esc(task.due)}</b></p>
    <form method="post" class="confirm"><div class="confirm-q">Confirm: <b class="tone-${opt.tone}">${esc(opt.label)}</b>?</div>${dateField}
    <button class="btn big ${opt.tone}" type="submit">Yes, confirm</button></form>
    <p class="muted">Nothing changes until you press confirm.</p>`), 'text/html; charset=utf-8');
}

// ---- Auth (optional) -------------------------------------------------------------------
function authorised(req) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return true;
  const h = (req.headers && req.headers.authorization) || '';
  if (!h.startsWith('Basic ')) return false;
  const given = Buffer.from(h.slice(6), 'base64').toString().split(':').slice(1).join(':');
  return given === pw;
}

// ---- Router ----------------------------------------------------------------------------
/** req = { method, path, headers, rawBody }  →  { code, type, body, headers? } */
async function handle(req) {
  const res = null;
  try {
    await store.load();
    if (!store.get().seeded && !process.env.NO_SEED && !isProd()) seed(scheduler.today());
    const p = req.path;
    if (req.origin && store.get().meta.origin !== req.origin && !/^\/healthz/.test(p)) { store.get().meta.origin = req.origin; store.save(); }
    if (p === '/healthz') return send(res, 200, { ok: true });
    const dm = p.match(/^\/decide\/([a-f0-9]+)\/([A-Za-z0-9_-]+)$/);
    if (dm && (req.method === 'GET' || req.method === 'POST')) return decidePage(req, res, dm[1], dm[2], req.method);

    if (!authorised(req)) return { code: 401, type: 'text/plain', body: 'Authentication required', headers: { 'WWW-Authenticate': 'Basic realm="Step Tracker"' } };

    if (p.startsWith('/api/')) {
      const db = store.get();
      if (req.method === 'GET' && p === '/api/state') return send(res, 200, state());
      if (req.method === 'GET' && p === '/api/alerts') return send(res, 200, db.alerts.slice(-300).reverse());

      if (req.method === 'POST' && p === '/api/candidates') {
        const b = parseJson(req.rawBody);
        const name = String(b.name || '').trim();
        if (!name) return send(res, 400, { error: 'Name is required.' });
        if (!store.HOUSES[b.house]) return send(res, 400, { error: 'Choose a house.' });
        if (!isValid(b.admittedOn)) return send(res, 400, { error: 'Enter the Step 2 admission date.' });
        const step = Number(b.step) === 3 ? 3 : 2;
        if (step === 3 && (!isValid(b.promotedOn) || b.promotedOn < b.admittedOn)) return send(res, 400, { error: 'Enter a valid promotion date (not before admission).' });
        const c = { id: store.uid(4), name, house: b.house, className: String(b.className || 'Unassigned').trim(), admittedOn: b.admittedOn, step, status: 'active',
          promotedOn: step === 3 ? b.promotedOn : null, classification: ['T2', 'T3'].includes(b.classification) && step === 3 ? b.classification : null, reviewCycle: 1, history: [], createdAt: new Date().toISOString() };
        db.candidates.push(c); store.save();
        return send(res, 201, enrich(c, scheduler.today()));
      }
      let m = p.match(/^\/api\/candidates\/([a-f0-9]+)$/);
      if (m && req.method === 'DELETE') {
        db.candidates = db.candidates.filter((c) => c.id !== m[1]);
        for (const k of Object.keys(db.tasks)) if (k.startsWith(m[1] + '|')) delete db.tasks[k];
        store.save(); return send(res, 200, { ok: true });
      }
      m = p.match(/^\/api\/candidates\/([a-f0-9]+)\/decide$/);
      if (m && req.method === 'POST') {
        const c = db.candidates.find((x) => x.id === m[1]);
        if (!c) return send(res, 404, { error: 'Not found' });
        const b = parseJson(req.rawBody);
        const r = decide(c, b.kind, b.option, { today: scheduler.today(), date: b.date || undefined });
        return send(res, r.ok ? 200 : 400, r.ok ? enrich(c, scheduler.today()) : { error: r.error });
      }
      if (req.method === 'PUT' && p === '/api/settings') {
        const b = parseJson(req.rawBody); const s = db.settings;
        for (const h of Object.keys(store.HOUSES)) if (b.houses?.[h]) s.houses[h] = { email: String(b.houses[h].email || '').trim(), phone: String(b.houses[h].phone || '').trim() };
        if (b.sendHour !== undefined) s.sendHour = Math.min(23, Math.max(0, Number(b.sendHour) || 0));
        if (b.autoRun !== undefined) s.autoRun = !!b.autoRun;
        if ('simulatedToday' in b) { if (b.simulatedToday && !isValid(b.simulatedToday)) return send(res, 400, { error: 'Invalid date' }); s.simulatedToday = b.simulatedToday || null; }
        store.save(); return send(res, 200, state());
      }
      if (req.method === 'POST' && p === '/api/run') { const r = await scheduler.runAlerts(); return send(res, 200, { sent: r, state: state() }); }
      if (req.method === 'POST' && p === '/api/seed') { seed(scheduler.today()); return send(res, 200, state()); }
      if (req.method === 'POST' && p === '/api/reset') { const keep = db.settings; store.reset(); store.get().settings = keep; store.save(); return send(res, 200, state()); }
      return send(res, 404, { error: 'Not found' });
    }

    return send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    console.error(e);
    return send(res, e.message === 'Bad JSON' ? 400 : 500, { error: e.message });
  } finally {
    await store.flush();
  }
}

module.exports = { handle };
