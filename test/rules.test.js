'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { addDays, addMonths } = require('../lib/dates');
const { currentTask, alertFor } = require('../lib/rules');

const cand = (o) => ({ id: 'x', status: 'active', step: 2, admittedOn: '2026-01-01', classification: null, reviewCycle: 1, ...o });

test('date helpers', () => {
  assert.strictEqual(addMonths('2026-08-31', 6), '2027-02-28');
  assert.strictEqual(addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(addDays('2026-01-01', 28), '2026-01-29');
});

test('promotion: due day 28, alerts start 7 days earlier then daily until decided', () => {
  const t = currentTask(cand());
  assert.strictEqual(t.due, '2026-01-29');
  assert.strictEqual(t.dailyFrom, '2026-01-22');
  assert.strictEqual(alertFor(t, '2026-01-21', []), null);
  assert.strictEqual(alertFor(t, '2026-01-22', []).phase, 'daily');
  assert.strictEqual(alertFor(t, '2026-01-22', ['2026-01-22']), null);   // once per day
  assert.strictEqual(alertFor(t, '2026-02-05', []).daysLeft, -7);       // keeps going when overdue
});

test('classification: 3 months from Step 2 admission; reminder at -14d, daily from -7d', () => {
  const t = currentTask(cand({ step: 3, promotedOn: '2026-01-30' }));
  assert.strictEqual(t.kind, 'classification');
  assert.strictEqual(t.due, '2026-04-01');
  assert.strictEqual(t.reminderOn, '2026-03-18');
  assert.strictEqual(alertFor(t, '2026-03-17', []), null);
  assert.strictEqual(alertFor(t, '2026-03-18', []).phase, 'reminder');
  assert.strictEqual(alertFor(t, '2026-03-19', ['2026-03-18']), null);   // gap between reminder and final week
  assert.strictEqual(alertFor(t, '2026-03-25', ['2026-03-18']).phase, 'daily');
});

test('review: 6 months from promotion date, repeats after "continue"', () => {
  const c = cand({ step: 3, promotedOn: '2026-01-30', classification: 'T2' });
  assert.strictEqual(currentTask(c).due, '2026-07-30');
  c.reviewCycle = 2;
  assert.strictEqual(currentTask(c).due, '2027-01-30');
  assert.strictEqual(currentTask(c).key, 'review:2');
});

test('ended candidates have no task', () => {
  assert.strictEqual(currentTask(cand({ status: 'evicted' })), null);
});
