'use strict';
const { addDays, addMonths, diffDays } = require('./dates');

// ---- Programme rules (edit here to change policy) ------------------------------------
const RULES = {
  promotionDays: 28,         // eligible for Step 3 after 28 days in Step 2
  promotionLeadDays: 7,      // alerts start 7 days before that date, daily until decided
  classifyMonths: 3,         // T2/T3 classification due 3 months after Step 2 admission
  classifyReminderDays: 14,  // one reminder 2 weeks before
  classifyDailyDays: 7,      // daily alerts in the last week
  reviewMonths: 6,           // Step 3 review every 6 months from promotion
  reviewReminderDays: 14,
  reviewDailyDays: 7,
};

const KINDS = {
  promotion: {
    label: 'Step 2 → Step 3 promotion',
    options: [
      { id: 'promote', label: 'Promote to Step 3', tone: 'go' },
      { id: 'discharge', label: 'Do not promote (discharge)', tone: 'stop' },
    ],
  },
  classification: {
    label: 'T2 / T3 classification',
    options: [
      { id: 'T2', label: 'Classify as T2', tone: 'blue' },
      { id: 'T3', label: 'Classify as T3', tone: 'violet' },
    ],
  },
  review: {
    label: '6-month Step 3 review',
    options: [
      { id: 'continue', label: 'Continue 6 more months', tone: 'go' },
      { id: 'evict', label: 'Evict from Step 3', tone: 'stop' },
    ],
  },
};

/**
 * Returns the single open decision for a candidate (or null), with its due date,
 * the date alerts begin, and the reminder / daily windows.
 */
function currentTask(c) {
  if (c.status !== 'active') return null;
  if (c.step === 2) {
    const due = addDays(c.admittedOn, RULES.promotionDays);
    return mk('promotion', 0, due, addDays(due, -RULES.promotionLeadDays), null);
  }
  if (c.step === 3) {
    if (!c.classification) {
      const due = addMonths(c.admittedOn, RULES.classifyMonths);
      return mk('classification', 0, due, addDays(due, -RULES.classifyDailyDays), addDays(due, -RULES.classifyReminderDays));
    }
    const cycle = c.reviewCycle || 1;
    const due = addMonths(c.promotedOn, RULES.reviewMonths * cycle);
    return mk('review', cycle, due, addDays(due, -RULES.reviewDailyDays), addDays(due, -RULES.reviewReminderDays));
  }
  return null;
}

function mk(kind, cycle, due, dailyFrom, reminderOn) {
  return { kind, cycle, key: `${kind}:${cycle}`, due, dailyFrom, reminderOn, label: KINDS[kind].label, options: KINDS[kind].options };
}

/** Which alert (if any) is due on `today`, given the dates alerts were already sent for this task. */
function alertFor(task, today, sentDates) {
  if (!task) return null;
  if (sentDates.includes(today)) return null;                       // at most one per day
  const daysLeft = diffDays(task.due, today);
  if (today >= task.dailyFrom) return { phase: 'daily', daysLeft };
  // single reminder: fire once on/after the reminder date if none sent yet
  if (task.reminderOn && today >= task.reminderOn && sentDates.length === 0) return { phase: 'reminder', daysLeft };
  return null;
}

/** Status used for dashboards. */
function urgency(task, today) {
  if (!task) return { level: 'none', daysLeft: null };
  const daysLeft = diffDays(task.due, today);
  let level = 'upcoming';
  if (daysLeft < 0) level = 'overdue';
  else if (today >= task.dailyFrom) level = 'alerting';
  else if (task.reminderOn && today >= task.reminderOn) level = 'reminder';
  return { level, daysLeft };
}

module.exports = { RULES, KINDS, currentTask, alertFor, urgency };
