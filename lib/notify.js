'use strict';
const nodemailer = require('nodemailer');

const env = process.env;
let transport = null;
const emailLive = () => !!env.SMTP_URL;
const smsLive = () => !!(env.TWILIO_SID && env.TWILIO_TOKEN && env.TWILIO_FROM);
const mode = () => ({ email: emailLive() ? 'live' : 'simulated', sms: smsLive() ? 'live' : 'simulated' });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const splitList = (s) => String(s || '').split(/[,;\s]+/).filter(Boolean);

async function sendEmail(to, subject, text, html) {
  if (!emailLive()) return { status: 'simulated' };
  transport = transport || nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({ from: env.MAIL_FROM || 'alerts@localhost', to, subject, text, html });
  return { status: 'sent' };
}

async function sendSms(to, body) {
  if (!smsLive()) return { status: 'simulated' };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status: 'sent' };
}

/** Compose the message for an alert. links: [{label, url, tone}] */
function compose({ candidate, houseName, task, phase, daysLeft }) {
  const when = daysLeft > 1 ? `due in ${daysLeft} days` : daysLeft === 1 ? 'due tomorrow' : daysLeft === 0 ? 'due TODAY' : `OVERDUE by ${-daysLeft} day${daysLeft === -1 ? '' : 's'}`;
  const prefix = daysLeft < 0 ? '🔴 OVERDUE' : phase === 'reminder' ? '🔔 Reminder' : '⚠️ Action needed';
  const subject = `${prefix}: ${task.label} — ${candidate.name} (${houseName})`;
  const intro = `${candidate.name} (${candidate.className}, ${houseName}) — ${task.label} ${when} (${task.due}).`;
  return { subject, intro };
}

function renderEmail({ intro, links, note }) {
  const text = `${intro}\n\n${note ? note + '\n\n' : ''}Record the decision with one click:\n` + links.map((l) => `• ${l.label}: ${l.url}`).join('\n') + '\n\nYou will get a daily alert until a decision is recorded.';
  const colors = { go: '#15803d', stop: '#b91c1c', blue: '#1d4ed8', violet: '#6d28d9' };
  const btns = links.map((l) => `<a href="${esc(l.url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 20px;border-radius:8px;background:${colors[l.tone] || '#1d4ed8'};color:#fff;text-decoration:none;font-weight:600">${esc(l.label)}</a>`).join('');
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
<h2 style="margin:0 0 12px">Decision needed</h2><p style="font-size:16px;line-height:1.5">${esc(intro)}</p>${note ? `<p style="color:#555">${esc(note)}</p>` : ''}<p>${btns}</p>
<p style="color:#6b7280;font-size:13px">One click opens a confirmation page — nothing changes until you confirm. Daily alerts continue until a decision is recorded.</p></div>`;
  return { text, html };
}

function renderSms({ intro, links }) {
  return `${intro}\n` + links.map((l) => `${l.label}: ${l.url}`).join('\n');
}

module.exports = { sendEmail, sendSms, compose, renderEmail, renderSms, mode, splitList };
