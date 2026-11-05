'use strict';
// All dates are plain "YYYY-MM-DD" strings, handled in UTC so DST never shifts a due date.

const pad = (n) => String(n).padStart(2, '0');
const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

function addDays(s, n) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); }

// Calendar-month addition; clamps to month end (31 Aug + 6 months => 28/29 Feb).
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000); // a - b
const isValid = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(toDate(s)) === s;
// APP_TIMEZONE (IANA, e.g. "Europe/London") makes "today" and the send hour follow your local clock on hosts running in UTC.
const tz = () => process.env.APP_TIMEZONE || process.env.TZ_NAME || '';
const todayReal = () => {
  if (tz()) return new Intl.DateTimeFormat('en-CA', { timeZone: tz(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
};
const hourNow = () => tz() ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', hourCycle: 'h23' }).format(new Date())) : new Date().getHours();

module.exports = { addDays, addMonths, diffDays, isValid, todayReal, hourNow };
