# Coach nudges as native iMessages (no Twilio)

The app can't send iMessages itself — nothing can, off Apple hardware — but
your iPhone can. Four Shortcuts automations pull the nudge text from Tally
and send it to you as a real blue-bubble message. Free, no server, fully
automatic once "Ask Before Running" is off.

**One-way**: replies to the self-message thread go nowhere. Talk back on
Telegram (@TallyCoachBot). For true two-way iMessage later, see
`imessage-bluebubbles.md`.

## Build the shortcut once

Shortcuts app → **+** (new shortcut) → name it **Tally Nudge**:

1. **Get Contents of URL**
   - URL: `https://tally.tors-bored.com/api/nudge/latest?slot=morning`
   - Tap the arrow → Method **GET** → Headers: add
     `Authorization` = `Bearer <SHORTCUT_API_TOKEN>` (the token from
     `/opt/drillbook/.env` — same one the health-sync shortcut uses).
2. **Get Dictionary Value** — key `text` from *Contents of URL*.
3. **Send Message** — message: *Dictionary Value*, recipient: **your own
   contact card**. Tap the recipient chip once it's set and make sure it
   shows your iCloud/phone (blue), not email.

Run it once manually — you should get a blue bubble from yourself with the
morning nudge, and the same text also lands on email/Telegram (the pull
triggers the normal delivery when the server cron hasn't fired yet).

## The four automations

Shortcuts app → **Automation** → **+** → **Time of Day** → set the time,
**Repeat: Daily** (or Weekly/Sunday for the last one) → Run **Tally Nudge**
→ after saving, open the automation and turn **Ask Before Running OFF**
(confirm "Don't Ask").

| Time | URL query |
|---|---|
| 8:05 AM daily | `?slot=morning` |
| 1:05 PM daily | `?slot=midday` |
| 8:05 PM daily | `?slot=evening` |
| 6:35 PM Sundays | `?kind=weekly` |

Duplicate the shortcut three times (or add a Dictionary/menu if you prefer
one shortcut) and point each automation at the right copy — the only
difference is the URL query.

**Why :05/:35?** The server cron fires at 8:00/1:00/8:00/6:00. The five-minute
offset means the phone always pulls the already-generated text instead of
racing the cron (a race is harmless — the endpoint is idempotent — but the
offset also means the weekly plan is actually finished before the phone asks
for it).

## Notes

- The automation runs only when the phone is on and unlocked-ish (iOS runs
  time-of-day automations in the background fine, but a dead phone sends
  nothing — email/Telegram still deliver server-side regardless).
- If you get `{"error":"unauthorized"}`, the Bearer header is missing or the
  token is wrong.
- "No nudge yet today." for the weekly query just means no Sunday plan has
  been generated yet.
