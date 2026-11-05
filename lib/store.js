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
});

let db = defaults();

function load() {
  try { db = { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; }
  catch { db = defaults(); }
  db.settings = { ...defaults().settings, ...db.settings, houses: { ...defaults().settings.houses, ...(db.settings || {}).houses } };
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

const uid = (n = 8) => crypto.randomBytes(n).toString('hex');
const get = () => db;
const reset = () => { db = defaults(); save(); return db; };

module.exports = { load, save, get, reset, uid, HOUSES };
