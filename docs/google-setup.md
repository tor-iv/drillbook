# Google Calendar setup (one-time, ~10 minutes)

Drillbook writes one all-day event per day ("Drillbook: 45 push-ups · ran
3.5mi") with the 8pm nudge. It needs an OAuth client and a single one-click
consent from you.

## Console steps

1. [console.cloud.google.com](https://console.cloud.google.com) → create project **drillbook**.
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name `Drillbook`, your email for both contact fields
   - Scopes: add `https://www.googleapis.com/auth/calendar.events`
   - **Publishing status: click "Publish app" → In production.** This matters:
     Testing-mode refresh tokens expire after 7 days, which silently kills the
     calendar writes. Production mode for this scope needs no Google review —
     you'll just click through a "Google hasn't verified this app" warning
     once (you're the only user).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Type: **Web application**, name `drillbook`
   - Authorized redirect URI: `https://drillbook.tors-bored.com/api/google/callback`
     (add `http://localhost:3000/api/google/callback` too if you want to test locally)
5. Copy the **Client ID** and **Client secret** into the server env as
   `DRILLBOOK_GOOGLE_CLIENT_ID` / `DRILLBOOK_GOOGLE_CLIENT_SECRET`, then
   restart the container.

## Connect

Log into the site → **Setup** → **Connect Google Calendar** → consent.
You should land back on Setup with "Connected." Verify with:

```sh
curl -X POST 'https://drillbook.tors-bored.com/api/cron/daily-nudge?secret=<CRON_SECRET>'
```

then check your calendar for today's Drillbook event.
