# iOS Shortcuts setup

Two Shortcuts connect your iPhone to Drillbook. Budget ~10 minutes.
You'll need your `SHORTCUT_API_TOKEN` (from the server `.env`).

## 1. "Drillbook Sync" — nightly Apple Health push

Shortcuts app → **+** → name it **Drillbook Sync**.

1. **Find Health Samples** — Type: *Weight*, Sort by: *Start Date*, Order: *Latest First*, Limit: *1*.
2. **Get Details of Health Sample** → *Value* (this becomes `bodyWeightLb`).
3. **Find Workouts** — where *Start Date* *is today*.
4. **Repeat with Each** (workouts). Inside the repeat:
   - **Get Details of Workout** for *Workout Type*, *Duration*, *Distance*, *Active Energy*, *Start Date*.
   - **Dictionary** with keys:
     - `type` (Text): map the workout type — easiest is an **If/Otherwise** chain or just hardcode by what you actually do: Running→`run`, Swimming→`swim`, Climbing→`climb`, Traditional/Functional Strength Training→`lift`, anything else→`other`
     - `durationMin` (Number): duration in minutes
     - `distanceMi` (Number): distance in miles (omit if none)
     - `calories` (Number): active energy
     - `startedAt` (Text): the workout's start date, formatted ISO 8601
   - **Add to Variable** → `workoutList`
5. **Dictionary** (the request body):
   - `date` (Text): **Current Date** formatted `yyyy-MM-dd`
   - `bodyWeightLb` (Number): the weight value from step 2
   - `workouts`: the `workoutList` variable (type Array)
6. **Get Contents of URL**:
   - URL: `https://drillbook.tors-bored.com/api/health-sync`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <SHORTCUT_API_TOKEN>`
   - Request Body: **JSON** → the dictionary from step 5

Test it by running manually — you should see `{"ok":true,...}`. Then:

7. **Automation** tab → **+** → *Time of Day* → 9:55 PM, Daily → **Run Immediately** (turn OFF "Ask Before Running") → run **Drillbook Sync**.

Re-running is safe — the server upserts, never duplicates.

## 2. "Drillbook Status" — evening notification

New Shortcut, name it **Drillbook Status**.

1. **Get Contents of URL**:
   - URL: `https://drillbook.tors-bored.com/api/status`
   - Method: **GET**
   - Headers: `Authorization` = `Bearer <SHORTCUT_API_TOKEN>`
2. **Get Dictionary Value** → key `summary`.
3. **Show Notification** — Title: `Drillbook`, Body: the `summary` value.

Automation: *Time of Day* → 8:30 PM daily → Run Immediately → **Drillbook Status**.
(The 8pm coach email fires server-side; this one pops on your lock screen.)

## History backfill (one-time, from your Mac)

```sh
pnpm import:health -- \
  --zip "$HOME/Library/Mobile Documents/com~apple~CloudDocs/export.zip" \
  --url https://drillbook.tors-bored.com \
  --token $SHORTCUT_API_TOKEN
```

Add `--dry-run` first to see what it found. The export in iCloud is from May
2026 — for full history, make a fresh export (Health app → profile photo →
*Export All Health Data*) whenever; overlapping imports are harmless.

## 3. Voice logging with Siri ("Hey Siri, log a meal")

Create one Shortcut per phrase — each is 3 actions: **Dictate Text** →
**Get Contents of URL** (POST `https://drillbook.tors-bored.com/api/log`,
header `Authorization: Bearer <SHORTCUT_API_TOKEN>`, JSON body below with the
dictated text) → **Speak** the `spoken` field from the response.

| Shortcut name (= Siri phrase) | JSON body |
|---|---|
| "Log a meal" | `{"type":"meal","description":<Dictated Text>}` |
| "Log a workout" | `{"type":"workout","description":<Dictated Text>}` |
| "Log push-ups" | `{"type":"counter","activityKey":"pushups","delta":<Dictated Text as Number>}` |
| "Log pull-ups" | `{"type":"counter","activityKey":"pullups","delta":<Dictated Text as Number>}` |
| "Log my weight" | `{"type":"weight","value":<Dictated Text as Number>}` |

These work from iPhone, Apple Watch ("Hey Siri" on the watch), CarPlay, and
AirPods. Siri speaks back the running total.
