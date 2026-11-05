'use strict';
const { currentTask } = require('./rules');
const { isValid } = require('./dates');
const store = require('./store');

/** Apply a decision to a candidate. `kind` must match the candidate's open task. */
function decide(candidate, kind, option, { today, date, via = 'dashboard' }) {
  const task = currentTask(candidate);
  if (!task) return { ok: false, error: 'This candidate has no open decision.' };
  if (task.kind !== kind) return { ok: false, error: 'That decision has already been made or is no longer open.' };
  if (!task.options.some((o) => o.id === option)) return { ok: false, error: 'Unknown option.' };

  const on = date || today;
  if (!isValid(on)) return { ok: false, error: 'Invalid date.' };
  if (on < candidate.admittedOn) return { ok: false, error: 'Date cannot be before admission.' };

  if (kind === 'promotion') {
    if (option === 'promote') { candidate.step = 3; candidate.promotedOn = on; }
    else { candidate.status = 'discharged'; candidate.endedOn = on; }
  } else if (kind === 'classification') {
    candidate.classification = option; candidate.classifiedOn = on;
  } else if (kind === 'review') {
    if (option === 'continue') candidate.reviewCycle = (candidate.reviewCycle || 1) + 1;
    else { candidate.status = 'evicted'; candidate.endedOn = on; }
  }
  const label = task.options.find((o) => o.id === option).label;
  candidate.history.push({ at: new Date().toISOString(), date: on, kind, option, label, via });
  store.save();
  return { ok: true, label, task };
}

module.exports = { decide };
