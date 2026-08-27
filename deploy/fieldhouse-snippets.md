# Fieldhouse deploy snippets

Verify against the actual conventions in `/opt/fieldhouse/docker-compose.yml`
before pasting. One-time server prep:

```sh
cd /opt && git clone git@github.com:tor-iv/drillbook.git
```

## docker-compose.yml — add under `services:`

```yaml
  drillbook:
    build:
      context: /opt/drillbook
    restart: unless-stopped
    expose:
      - "3000"
    volumes:
      - drillbook_data:/app/data
    environment:
      DB_PATH: /app/data/drillbook.db
      UPLOAD_DIR: /app/data/photos
      APP_URL: https://drillbook.tors-bored.com
      APP_PIN: ${DRILLBOOK_APP_PIN}
      AUTH_COOKIE_SECRET: ${DRILLBOOK_AUTH_COOKIE_SECRET}
      SHORTCUT_API_TOKEN: ${DRILLBOOK_SHORTCUT_API_TOKEN}
      CRON_SECRET: ${DRILLBOOK_CRON_SECRET}
      CRON_ENABLED: "true"
      CRON_TIMEZONE: America/New_York
      RESEND_API_KEY: ${DRILLBOOK_RESEND_API_KEY}
      RESEND_FROM_EMAIL: "Drillbook <nudge@foefinder.me>"
      NUDGE_EMAIL_TO: vcox484@gmail.com
      DEEPSEEK_API_KEY: ${DRILLBOOK_DEEPSEEK_API_KEY}
      GOOGLE_CLIENT_ID: ${DRILLBOOK_GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${DRILLBOOK_GOOGLE_CLIENT_SECRET}
      HTTPS: "true"
      NODE_ENV: production

  # One-shot migration runner (same volume — otherwise it migrates a throwaway
  # DB inside its own container layer).
  drillbook-migrate:
    build:
      context: /opt/drillbook
      target: builder
    command: ["pnpm", "run", "db:migrate"]
    restart: "no"
    volumes:
      - drillbook_data:/app/data
    environment:
      DB_PATH: /app/data/drillbook.db
```

and under `volumes:`:

```yaml
  drillbook_data:
```

## Fieldhouse `.env` additions

```sh
DRILLBOOK_APP_PIN=<pick a PIN>
DRILLBOOK_AUTH_COOKIE_SECRET=<openssl rand -hex 32>
DRILLBOOK_SHORTCUT_API_TOKEN=<openssl rand -hex 24>
DRILLBOOK_CRON_SECRET=<openssl rand -hex 24>
DRILLBOOK_RESEND_API_KEY=<reuse foefinder's Resend key>
DRILLBOOK_DEEPSEEK_API_KEY=<reuse clay-oracle's DeepSeek key>
DRILLBOOK_GOOGLE_CLIENT_ID=      # after docs/google-setup.md
DRILLBOOK_GOOGLE_CLIENT_SECRET=  # after docs/google-setup.md
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
