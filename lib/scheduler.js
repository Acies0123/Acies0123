'use strict';
const store = require('./store');
const { currentTask, alertFor } = require('./rules');
const { todayReal, hourNow } = require('./dates');
const notify = require('./notify');

const today = () => store.get().settings.simulatedToday || todayReal();

function baseUrl() { return (process.env.BASE_URL || store.get().meta.origin || process.env.URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''); }

function taskRecord(candidate, task) {
  const db = store.get();
  const k = `${candidate.id}|${task.key}`;
  if (!db.tasks[k]) db.tasks[k] = { token: store.uid(12), sentDates: [] };
  return db.tasks[k];
}

/** Evaluate every candidate and send whatever alerts are due today. */
async function runAlerts({ force = false } = {}) {
  const db = store.get();
  const t = today();
  const results = [];
  for (const c of db.candidates) {
    const task = currentTask(c);
    if (!task) continue;
    const rec = taskRecord(c, task);
    const due = alertFor(task, t, rec.sentDates);
    if (!due) continue;

    const house = store.HOUSES[c.house];
    const contact = db.settings.houses[c.house] || {};
    const links = task.options.map((o) => ({ ...o, url: `${baseUrl()}/decide/${rec.token}/${o.id}` }));
    const { subject, intro } = notify.compose({ candidate: c, houseName: house, task, phase: due.phase, daysLeft: due.daysLeft });
    const note = task.kind === 'promotion' ? `Eligible for Step 3 on ${task.due} (28 days after admission on ${c.admittedOn}).`
      : task.kind === 'classification' ? `3 months from Step 2 admission on ${c.admittedOn}.`
      : `6-month review of time in Step 3 (promoted ${c.promotedOn}${(c.reviewCycle || 1) > 1 ? `, review #${c.reviewCycle}` : ''}).`;
    const base = { candidateId: c.id, candidateName: c.name, house: c.house, kind: task.kind, taskKey: task.key, phase: due.phase, daysLeft: due.daysLeft, date: t, links: links.map(({ label, url }) => ({ label, url })) };
    const send = async (channel, to, fn) => {
      let status, error;
      try { status = (await fn()).status; } catch (e) { status = 'failed'; error = e.message; }
      db.alerts.push({ id: store.uid(5), at: new Date().toISOString(), channel, to, status, error, subject, ...base, body: channel === 'sms' ? notify.renderSms({ intro, links }) : notify.renderEmail({ intro, links, note }).text });
      return status;
    };

    const email = notify.renderEmail({ intro, links, note });
    const statuses = [];
    for (const to of notify.splitList(contact.email)) statuses.push(await send('email', to, () => notify.sendEmail(to, subject, email.text, email.html)));
    for (const to of notify.splitList(contact.phone)) statuses.push(await send('sms', to, () => notify.sendSms(to, notify.renderSms({ intro, links }))));
    if (!statuses.length && !db.alerts.some((a) => a.status === 'no-recipient' && a.candidateId === c.id && a.taskKey === task.key && a.date === t)) {
      db.alerts.push({ id: store.uid(5), at: new Date().toISOString(), channel: 'none', to: '', status: 'no-recipient', subject, ...base, body: `No email/phone set for ${house}. Add one in Settings.` });
    }
    // Only mark the day as handled if at least one delivery went out (or was simulated),
    // so a missing contact or a failed send is retried on the next run.
    if (statuses.some((s) => s !== 'failed')) rec.sentDates.push(t);
    if (statuses.length) results.push({ candidate: c.name, kind: task.kind, phase: due.phase, statuses });
  }
  store.save();
  return results;
}

/** Run the daily batch once per day after the configured hour. Safe to call as often as you like. */
async function maybeRunDaily() {
  const db = store.get(); const s = db.settings;
  const day = todayReal();
  if (!s.autoRun || hourNow() < Number(s.sendHour) || db.meta.lastRunDay === day) return null;
  db.meta.lastRunDay = day; store.save();
  try { return await runAlerts(); }
  catch (e) { db.meta.lastRunDay = null; store.save(); throw e; }
}

let timer = null;
function start() {
  const tick = async () => {
    try { const r = await maybeRunDaily(); if (r && r.length) console.log(`[alerts] sent ${r.length} alert(s)`); }
    catch (e) { console.error('[alerts] run failed', e); }
  };
  tick();
  timer = setInterval(tick, 60 * 1000);
}
const stop = () => timer && clearInterval(timer);

module.exports = { runAlerts, maybeRunDaily, start, stop, today, baseUrl };
