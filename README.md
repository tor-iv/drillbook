# Drillbook

Single-user accountability tracker: log daily pull-ups, push-ups, squats, abs,
pages read, and body weight in under 10 seconds; get nagged by an AI coach when
you're behind. Lives at [drillbook.tors-bored.com](https://drillbook.tors-bored.com).

- **Today** — tap-to-log counters, streak tally marks, tonight's coach nudge
- **Trends** — per-activity daily charts vs goal, 7/30/90 day
- **Photos** — private progress pics, tap two to compare
- **Coach** — DeepSeek-written weekly training plan (run/swim/climb/lift), Sundays 6pm
- **Nudges** — 8pm email (Resend) + iOS Shortcut notification when behind
- **Sync** — nightly Apple Health Shortcut push + one-time history import
- **Calendar** — daily summary event written to Google Calendar

## Stack

Next.js 16 (App Router) · SQLite (better-sqlite3 + Drizzle) · node-cron
in-process scheduler · DeepSeek via the OpenAI SDK · Resend · hand-rolled
Google OAuth. One Docker container on the fieldhouse box; DB + photos on one
volume.

## Dev

```sh
pnpm install
pnpm db:migrate      # creates + seeds data/drillbook.db
cp .env.example .env # set APP_PIN etc.
pnpm dev
```

PIN login, then everything is on localhost:3000. Crons are off in dev
(`CRON_ENABLED=false`); trigger manually:

```sh
curl -X POST 'localhost:3000/api/cron/daily-nudge?secret=<CRON_SECRET>'
```

## Deploy

Push to `main` → GitHub Actions SSHes to the Hetzner box, pulls
`/opt/drillbook`, rebuilds + migrates + recreates the `drillbook` service in
the fieldhouse compose stack. First-time setup: `deploy/fieldhouse-snippets.md`.

## Phone setup

`docs/apple-health-shortcut.md` — the two iOS Shortcuts (nightly Health sync,
evening status notification) and the history import.
`docs/google-setup.md` — Google Calendar OAuth.
