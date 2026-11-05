# Step Tracker — Houses of Windsor & Tudor

Web app that tracks candidates through Step 2 → Step 3 and sends email + SMS alerts with
one-click decision links that feed straight back into the app.

## Rules implemented (`lib/rules.js`)
| Decision | Due | Alerts |
|---|---|---|
| **Step 2 → Step 3 promotion** | 28 days after admission | Daily from 7 days before the due date, until a decision is recorded (continues if overdue) |
| **T2 / T3 classification** (after promotion) | 3 calendar months after the *Step 2 admission* date | One reminder 14 days before; daily for the final 7 days, until decided |
| **6-month Step 3 review** — continue or evict | 6 months after the recorded *promotion date* | One reminder 14 days before; daily for the final 7 days. "Continue" starts another 6-month cycle |

Promotion records the promotion date (defaults to today, editable) and all later dates derive from it.
Alerts go to the email address(es)/phone number(s) configured per house (Settings).

## Run
```bash
npm install
npm start            # http://localhost:3000
npm test
```
First launch loads sample candidates. In **Settings** use *Time travel* (+1 day / +7 days) and
**Run alerts now** to watch reminders and daily alerts fire; every message (with its decision links)
appears in the **Alert log**.

## Real delivery (env vars)
| Var | Purpose |
|---|---|
| `BASE_URL` | Public URL used in links (e.g. `https://tracker.example.org`) — required for links to work on phones |
| `SMTP_URL` | e.g. `smtps://user:pass@smtp.example.com` (nodemailer); `MAIL_FROM` sets sender |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` | SMS via Twilio |
| `ADMIN_PASSWORD` | Protects the dashboard with HTTP Basic auth (decision links stay public by design — each is an unguessable per-candidate token) |
| `PORT`, `DATA_FILE`, `NO_SEED` | Misc |

Without SMTP/Twilio the app runs in demo mode and records messages instead of sending them.

Decision links open a confirmation page; nothing changes until the button there is pressed, so
email scanners that pre-fetch links can't trigger decisions. Daily sends run once per day after the
configured hour; a day only counts as handled once a delivery succeeds, so failures retry.
Data is stored in `data/db.json`.

## Deploying live on Netlify
The same code runs on Netlify: `netlify/functions/api.mjs` serves the API and decision links, `netlify/functions/daily-alerts.mjs`
is an hourly scheduled function that sends each day's alerts once (after the send hour in Settings), and data lives in Netlify Blobs.

1. Netlify → **Add new site → Import an existing project** → pick this repo/branch (settings are read from `netlify.toml`; no build command needed).
2. **Site configuration → Environment variables:** `ADMIN_PASSWORD`, `APP_TIMEZONE` (e.g. `Europe/London`, so "today" and the send hour use your clock), `SMTP_URL`, `MAIL_FROM`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`. `BASE_URL` is optional (defaults to the site address).
3. Deploy, open the site (any username + your `ADMIN_PASSWORD`), set each house's email/phone in **Settings**, then **Run alerts now** to test.

Notes: scheduled functions run on the published (production) deploy only. Writes are last-write-wins, which is fine for a small team.
Also works on any Node/Docker host (`Dockerfile`, `render.yaml`) with a persistent disk.
