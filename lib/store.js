'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

const HOUSES = { windsor: 'House of Windsor', tudor: 'House of Tudor' };

const defaults = () => ({
  settings: {
    houses: {
      windsor: { email: '', phone: '' },
      tudor: { email: '', phone: '' },
    },
    sendHour: 8,            // local server hour at which the daily run happens
    simulatedToday: null,   // "YYYY-MM-DD" to time-travel for demos / testing
    autoRun: true,
  },
  candidates: [],
  tasks: {},   // `${candidateId}|${taskKey}` -> { token, sentDates: [] }
  alerts: [],  // outbox / audit log (newest last)
  seeded: false,
  meta: {},    // lastRunDay etc.
});

let db = defaults();

const onNetlify = () => !!process.env.NETLIFY || !!process.env.NETLIFY_BLOBS_CONTEXT;
let dirty = false, loaded = false, blobs = null;
const getBlobs = async () => blobs || (blobs = (await import('@netlify/blobs')).getStore('step-tracker'));

function normalise(raw) {
  const d = defaults();
  db = { ...d, ...(raw || {}) };
  db.settings = { ...d.settings, ...db.settings, houses: { ...d.settings.houses, ...((raw || {}).settings || {}).houses } };
  db.meta = db.meta || {};
  return db;
}

/** Load state. File backend loads once (single long-lived process); Netlify reloads on every invocation. */
async function load({ force = false } = {}) {
  if (loaded && !force && !onNetlify()) return db;
  let raw = null;
  try {
    if (onNetlify()) raw = await (await getBlobs()).get('db', { type: 'json' });
    else raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { raw = null; }
  loaded = true; dirty = false;
  return normalise(raw);
}

/** Mark state changed. File backend writes immediately; Netlify writes on flush(). */
function save() {
  if (onNetlify()) { dirty = true; return; }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}
async function flush() {
  if (onNetlify() && dirty) { await (await getBlobs()).setJSON('db', db); dirty = false; }
}

const uid = (n = 8) => crypto.randomBytes(n).toString('hex');
const get = () => db;
const reset = () => { db = defaults(); save(); return db; };

module.exports = { load, save, flush, get, reset, uid, HOUSES, onNetlify };
