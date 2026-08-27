# Fieldhouse deploy snippets

Verify against the actual conventions in `/opt/fieldhouse/docker-compose.yml`
before pasting. One-time server prep:

```sh
cd /opt && git clone git@github.com:tor-iv/drillbook.git
```

## docker-compose.yml — add under `services:`

```yaml
  # Drillbook (colocated app) ───────────────────────────────────────────────
  drillbook:
    build:
      context: ../drillbook
    restart: unless-stopped
    expose:
      - "3000"
    volumes:
      - drillbookdata:/app/data
    env_file:
      - ../drillbook/.env
    environment:
      DB_PATH: /app/data/drillbook.db
      UPLOAD_DIR: /app/data/photos
      HTTPS: "true"

  # Migration runner for drillbook. Profiles gate keeps `up -d` from starting
  # it; the deploy workflow invokes it explicitly:
  #   docker compose run --rm drillbook-migrate
  drillbook-migrate:
    build:
      context: ../drillbook
      target: builder
    profiles: ["tools"]
    # Same uid as the runner so migrate never leaves root-owned files on the
    # shared volume (SQLITE_READONLY_DIRECTORY otherwise); corepack needs a
    # writable HOME when non-root.
    user: "1001:1001"
    command: ["pnpm", "run", "db:migrate"]
    volumes:
      - drillbookdata:/app/data
    environment:
      DB_PATH: /app/data/drillbook.db
      HOME: /tmp
```

and under `volumes:`:

```yaml
  drillbookdata:
```

## `/opt/drillbook/.env` (per-app env_file, like claydate/clay-oracle)

```sh
APP_URL=https://drillbook.tors-bored.com
APP_PIN=<pick a PIN>
AUTH_COOKIE_SECRET=<openssl rand -hex 32>
SHORTCUT_API_TOKEN=<openssl rand -hex 24>
CRON_SECRET=<openssl rand -hex 24>
CRON_ENABLED=true
CRON_TIMEZONE=America/New_York
RESEND_API_KEY=<reuse foefinder's Resend key>
RESEND_FROM_EMAIL=Drillbook <nudge@foefinder.me>
NUDGE_EMAIL_TO=vcox484@gmail.com
DEEPSEEK_API_KEY=<reuse clay-oracle's DeepSeek key>
ANTHROPIC_API_KEY=<console.anthropic.com key — food photo calorie estimates>
FOOD_MODEL=claude-haiku-4-5
GOOGLE_CLIENT_ID=      # after docs/google-setup.md
GOOGLE_CLIENT_SECRET=  # after docs/google-setup.md
```

## Caddyfile — add a site block

```
drillbook.tors-bored.com {
	encode gzip
	reverse_proxy drillbook:3000
}
```

Then `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`
(or however the fieldhouse Caddy reloads).

## DNS

`drillbook.tors-bored.com` → A record → `5.161.201.101`
