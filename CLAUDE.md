# CLAUDE.md

## Project

**Drillbook** — single-user daily accountability tracker (reps, pages, weight,
progress pics) with AI coach nudges. Deployed at drillbook.tors-bored.com on
the shared fieldhouse compose stack (Hetzner, 5.161.201.101).

## Commands

```sh
pnpm dev          # dev server (Node — do NOT use bun, better-sqlite3 ABI breaks)
pnpm build        # production build (standalone)
pnpm lint
pnpm db:generate  # drizzle-kit migration from src/db/schema.ts
pnpm db:migrate   # apply migrations + seed default activities
pnpm import:health -- --zip <export.zip> --url <base> --token <token>
```

## Architecture notes

- **Generic activity model**: `activities` (kind: counter|measure) + `entries`
  (UNIQUE activity_id+date). New trackables are settings rows, not migrations.
- **All day/streak logic** lives in `src/lib/status.ts`; dates are computed in
  `CRON_TIMEZONE` via `src/lib/dates.ts` — never use raw `new Date()` date math.
- **Crons run in-process** (`src/instrumentation.ts`, node-cron) — the
  standalone server is one persistent Node process. `cron_runs` table makes
  jobs restart-safe. Manual triggers: `POST /api/cron/*?secret=CRON_SECRET`.
- **Auth**: PIN → jose-signed cookie, checked edge-side in `src/proxy.ts`
  (signature only; `/api/*` excluded — each route enforces cookie or bearer).
  Shortcut endpoints (`/api/status`, `/api/health-sync`) use
  `SHORTCUT_API_TOKEN` bearer auth.
- **Photos are private**: stored under `UPLOAD_DIR`, served only through the
  cookie-checked `/api/photos/[id]/file` route. Never put them in `public/`.
- **DeepSeek** via `openai` SDK with `baseURL: https://api.deepseek.com`
  (`src/lib/deepseek.ts`). Every integration (LLM, Resend, Google) has a
  `*Configured()` guard and a working fallback — keep it that way.
- **Docker footgun**: the runner stage COPYs better-sqlite3 out of
  `.pnpm/better-sqlite3@*` with a wildcard — don't pin the version there.

## Deploy

Push to main → `.github/workflows/deploy.yml` (SSH: pull /opt/drillbook,
compose build + run drillbook-migrate + up -d --force-recreate drillbook).
Compose/Caddy live in the *fieldhouse* repo/box, not here — snippets in
`deploy/fieldhouse-snippets.md`.
