# Automatic Apple Health sync (Health Auto Export)

The [Health Auto Export](https://apps.apple.com/us/app/health-auto-export-json-csv/id1115567069)
app pushes HealthKit data to Tally in the background — no Shortcuts to build
or run. Weight and workouts just show up. Automations need Premium
($1.99/mo or $24.99 lifetime, 7-day free trial).

## One-time setup (~5 min)

1. Install **Health Auto Export - JSON+CSV** from the App Store.
2. On first launch, grant Health access — at minimum **Body Mass (Weight)**
   and **Workouts** (read).
3. Go to **Automations** → **+** → **REST API**:
   - **URL**: `https://tally.tors-bored.com/api/health-sync`
   - **Method**: POST — **Format**: JSON
   - **Headers**: add `Authorization` = `Bearer <SHORTCUT_API_TOKEN>`
     (token lives in `/opt/drillbook/.env`)
   - **Data**: select the **Weight/Body Mass** metric and enable
     **Workouts** (all types)
   - **Sync interval**: Daily (hourly also fine — re-pushes are idempotent)
   - **Aggregation**: Days
4. Tap **Export Now / Run** once to test. The response should read
   `{"ok":true, ...}` and the weight/workout should appear in Tally's
   trends within a minute.

## How it lands server-side

`/api/health-sync` detects the HAE payload shape (`{"data": {...}}`) and
converts it: kg→lb, km/m→miles, workout names mapped to run/swim/climb/lift
(unrecognized names log a `[hae] unmapped workout type` warning on the
server — check `docker logs fieldhouse-drillbook-1` after the first sync
and extend `HAE_TYPE_MAP` if something's missing). Re-syncs upsert, never
duplicate.

## Caveat

iOS only lets apps read Health data while the phone is unlocked, so the
automation fires around normal phone use — a day you never touch the phone
syncs late, not never. The nightly Shortcut in `apple-health-shortcut.md`
§1 remains the free fallback if you ever drop the subscription.
