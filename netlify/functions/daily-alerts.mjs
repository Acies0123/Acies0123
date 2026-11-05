// Runs hourly (UTC). Sends the day's alerts once, after the "send hour" set in Settings
// (interpreted in APP_TIMEZONE if set, otherwise UTC).
import store from '../../lib/store.js';
import scheduler from '../../lib/scheduler.js';

export default async () => {
  await store.load();
  try {
    const sent = await scheduler.maybeRunDaily();
    console.log(sent ? `[alerts] sent ${sent.length} alert(s)` : '[alerts] nothing to do this hour');
  } finally {
    await store.flush();
  }
};

export const config = { schedule: '0 * * * *' };
