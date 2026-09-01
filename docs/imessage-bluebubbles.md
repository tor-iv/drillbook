# Two-way iMessage via BlueBubbles (design, not built)

Blocked on: an always-on Mac at home. When that exists, this doc is the
build spec. Until then, delivery-only iMessage runs through Shortcuts
(`imessage-shortcut.md`) and conversation runs through Telegram.

## Why BlueBubbles

Hosted iMessage APIs are business-priced (Sendblue $100/mo/line, LoopMessage
$60/mo, Blooio $89/mo) — rejected. BlueBubbles is free, open-source, and
self-hosted: a macOS server app signed into your Apple ID relays iMessage
over a REST API + webhooks. One Mac, one Apple ID. Plain send/receive needs
no SIP changes (private-API extras like typing indicators do — skip them).

## Architecture

```
iPhone ⇄ iMessage ⇄ Mac (BlueBubbles server, port 1234)
                      ⇅ Cloudflare Tunnel (needs real cert; self-signed rejected)
                Hetzner app (drillbook)
                  - src/lib/imessage.ts        send: POST /api/v1/message/text
                  - /api/imessage webhook      receive: new-message events
```

## Build steps (future session)

1. Mac: install BlueBubbles server, sign into iMessage, set server password.
2. Expose: `cloudflared tunnel` mapped to a subdomain (e.g.
   `bb.tors-bored.com`) — BlueBubbles requires a valid TLS cert for webhooks.
3. App: `src/lib/imessage.ts` mirroring `telegram.ts` —
   `sendImessage(text)` → `POST ${BLUEBUBBLES_URL}/api/v1/message/text`
   with `{chatGuid, message}` + password param. Env: `BLUEBUBBLES_URL`,
   `BLUEBUBBLES_PASSWORD`, `BLUEBUBBLES_CHAT_GUID` (the self-chat).
4. Webhook route `src/app/api/imessage/route.ts`: BEFORE building it, factor
   `ROUTER_SYSTEM`, `actionSchema`, and `runAction` out of
   `src/app/api/telegram/route.ts` into `src/lib/coach-router.ts` so both
   channels share one brain. The webhook filters to the owner's handle,
   ignores messages sent by the server itself (`isFromMe` events echo back),
   and replies via `sendImessage`.
5. Add iMessage as a best-effort delivery in `runDailyNudge` alongside
   email/SMS/Telegram, gated on the env vars being set.

## Gotchas researched up front

- Webhooks fire for *outgoing* messages too — drop `isFromMe` or every bot
  reply loops forever.
- The Mac sleeping kills everything: `caffeinate` or Energy Saver "prevent
  sleep"; a laptop lid-closed needs external display trickery or
  `sudo pmset -a sleep 0`.
- Apple occasionally signs you out after OS updates — the coach going silent
  on iMessage while Telegram still works = check the Mac first.
