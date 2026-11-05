'use strict';
const store = require('./store');
const { addDays, addMonths } = require('./dates');

function seed(today) {
  const db = store.get();
  const mk = (name, house, className, admittedOn, extra = {}) => ({
    id: store.uid(4), name, house, className, admittedOn, step: 2, status: 'active',
    classification: null, promotedOn: null, reviewCycle: 1, history: [], createdAt: new Date().toISOString(), ...extra,
  });
  const ago = (d) => addDays(today, -d);
  db.candidates.push(
    mk('Amelia Hartwell', 'windsor', 'Class 14A', ago(12)),                      // upcoming
    mk('Oliver Bennett', 'tudor', 'Class 14A', ago(22)),                         // alerting (due in 6)
    mk('Priya Nair', 'windsor', 'Class 14A', ago(26)),                           // alerting (due in 2)
    mk('Marcus Reyes', 'tudor', 'Class 13C', ago(31)),                           // overdue
    mk('Grace Okafor', 'windsor', 'Class 13C', addDays(addMonths(today, -3), 12), { step: 3, promotedOn: ago(60) }), // classification reminder window
    mk('Daniel Whitfield', 'tudor', 'Class 12B', addDays(addMonths(today, -3), 4), { step: 3, promotedOn: ago(75) }), // classification daily
    mk('Sofia Marchetti', 'windsor', 'Class 11A', addMonths(today, -7), { step: 3, promotedOn: addDays(addMonths(today, -6), 10), classification: 'T2', classifiedOn: ago(120) }), // 6-month review reminder
    mk('Henry Caldwell', 'tudor', 'Class 11A', addMonths(today, -7), { step: 3, promotedOn: addDays(addMonths(today, -6), 5), classification: 'T3', classifiedOn: ago(110) }),  // review daily
    mk('Isla Thornton', 'tudor', 'Class 10B', addMonths(today, -4), { step: 3, promotedOn: addMonths(today, -3), classification: 'T3', classifiedOn: ago(30) }),     // calm
  );
  db.seeded = true;
  store.save();
}
module.exports = { seed };
