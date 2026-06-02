# Riste AI — Phase 1 (Next.js)

An AI relationship manager that keeps your important people warm, automatically.
Phase 1 = **email channel**, contacts, tone profiles, scheduler, auto-reply with a
human-in-the-loop safety net, and the operator dashboard.

## Stack
- **Next.js (TypeScript)** — dashboard + API routes + inbound webhooks
- **Node worker + BullMQ + Redis** — scheduler and send/reply jobs
- **Prisma + PostgreSQL** — data
- **Ollama / Gemini / Groq** — the AI (pick via `AI_PROVIDER`)
- **Nodemailer (Gmail)** — email channel

## Project layout
```
riste-app/
├── docker-compose.yml      # postgres, redis, web, worker, (ollama)
├── Dockerfile
├── prisma/schema.prisma    # Contact, ContactChannel, ToneProfile, Message, Setting
├── prisma/seed.ts
└── src/
    ├── app/                # Next.js dashboard + API
    │   ├── page.tsx        # Activity feed + "Needs your attention"
    │   ├── contacts/       # Contacts view
    │   └── api/            # contacts, webhooks/inbound, messages/approve, settings/killswitch
    ├── lib/
    │   ├── db.ts           # Prisma client
    │   ├── queue.ts        # BullMQ queue + Redis
    │   ├── ai/             # engine.ts (providers) + prompt.ts (your voice)
    │   └── channels/       # types.ts (interface) + email.ts + index.ts (registry)
    └── worker/             # index.ts, scheduler.ts, processors.ts
```

## Run locally
```bash
cp .env.example .env          # then fill in SMTP_USER / SMTP_PASS (Gmail app password)
docker compose up -d riste-db riste-redis   # start Postgres + Redis
npm install
npm run prisma:generate
npm run prisma:migrate        # creates the tables
npm run db:seed               # optional: demo contact + settings

# two processes:
npm run dev                   # dashboard at http://localhost:3000
npm run worker:dev            # scheduler + job processor
```

To use local AI: `docker compose up -d ollama && docker exec -it <ollama> ollama pull llama3.1:8b`,
or set `AI_PROVIDER=groq` / `gemini` with the matching API key in `.env`.

## Run everything in Docker (VPS)
```bash
docker compose up -d --build
# First stand-up (no committed migrations yet): create the tables directly.
docker compose exec riste-web npx prisma db push
# Once you've committed migrations (prisma migrate dev locally), use instead:
# docker compose exec riste-web npx prisma migrate deploy
```

## How it works — human is in control by default
- **Default = approve everything.** New contacts are `SUPERVISED`: every message (greeting
  *and* reply) is drafted and **waits for your tap** — nothing sends on its own.
- **Scheduler** (worker) ticks every minute; when a contact's local time matches their
  `morningTime`/`eveningTime`, it enqueues a greeting job → AI drafts it → status
  `AWAITING_APPROVAL` → you get notified.
- **Inbound** (their reply) hits `POST /api/webhooks/inbound`, gets stored, and enqueues an
  inbound job → AI drafts a reply → `AWAITING_APPROVAL` (waits for you).
- **Loosening per contact (optional):** set a contact to `AUTO_GREETINGS` (greetings auto,
  replies still approved) or `FULL_AUTO` (replies auto-send only when confident & not flagged).
- **Guardrail:** the AI emits `__ESCALATE__` for anything emotional, money-related, conflict,
  or "let's meet / call me" — those become `HELD` and always come back to you.
- **Kill switch:** `POST /api/settings/killswitch {"on": true}` stops all sending instantly.

## Your controls
- **Notifications:** when a draft is ready you get a **Telegram** message with **Approve /
  Reject** buttons (act without opening the dashboard). The dashboard's "Needs your attention"
  queue always shows them too. (WhatsApp-to-self is a planned Phase 4 notifier.)
- **Per-message API:** `POST /api/messages/approve {id, body?}` (edit-and-send),
  `POST /api/messages/reject {id}`, `POST /api/messages/regenerate {id}` (new draft).
- **Telegram setup:** create a bot via @BotFather, put the token + your chat id in `.env`, then
  register the webhook (the secret token must equal your `WEBHOOK_SECRET`):
  `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhooks/telegram&secret_token=<WEBHOOK_SECRET>`

## Inbound webhook shape (email poller / SMS gateway POST this)
```json
{ "secret": "WEBHOOK_SECRET", "contactId": "...", "channel": "EMAIL", "body": "their message" }
```

## Phase 1 status — email loop is now closed
- ✅ **Email reply reader (IMAP):** the worker polls Gmail every 60s, matches the sender to a
  contact, stores the inbound message, and enqueues a reply draft. Only matched mail is marked
  read, so the rest of your inbox is untouched. (`src/worker/email-poller.ts`)
- ✅ **Dashboard actions:** the "Needs your attention" queue has editable drafts with
  **Approve & send / Regenerate / Reject** buttons. (`src/app/_components/MessageActions.tsx`)
- ✅ **Telegram** approve/reject from chat, **kill switch**, per-contact autonomy.

### Still open (deliberate, later phases or need external setup)
- **Tone seeding is manual** (paste past messages via the contacts API / seed) — no import UI yet.
- **No dashboard auth / tests** — single-operator; run behind your VPS auth (e.g. Caddy basic-auth).
- SMS, festival engine, and WhatsApp need external accounts/devices — see roadmap.

## SMS setup (android-sms-gateway)
1. Install the app from https://github.com/capcom6/android-sms-gateway on your phone; enable
   **Local server**, set a username/password.
2. Put the phone's URL + credentials in `.env` (`SMS_GATEWAY_URL`, `SMS_GATEWAY_USERNAME`,
   `SMS_GATEWAY_PASSWORD`). The VPS must be able to reach the phone (same LAN, VPN, or the
   gateway's cloud relay).
3. For incoming SMS, add a gateway webhook for `sms:received` pointing at
   `<APP_URL>/api/webhooks/sms?secret=<WEBHOOK_SECRET>`.
4. Add an SMS channel to a contact: `{ "type": "SMS", "value": "+9198XXXXXXXX", "isPrimary": true }`.

## Festivals & birthdays (Phase 3)
1. Get a free key at https://calendarific.com, set `CALENDARIFIC_API_KEY` in `.env`.
2. Pull the year: `POST /api/festivals/refresh {"year": 2026}` (do this once a year).
3. Add niche Jayantis / personal dates by hand: `POST /api/festivals {"name":"Dad's Anniversary","date":"2026-09-14","tags":["family"]}`.
4. Opt a contact in via their **festival tags** (on the add-contact form or API), e.g.
   `["hindu","national holiday"]`, `["all"]`, or a birthday `["birthday:1990-05-12"]`.

On a matching day, the festival/birthday wish **replaces** that contact's plain good-morning
(fires at their morning time, or 09:00 if none) — still drafted in your voice, still gated by
your approval.

## WhatsApp setup (Meta Cloud API) — Phase 4
1. Create a Meta WhatsApp Business app (or use a BSP), get a **token** + **phone number id**;
   set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` in `.env`.
2. Add the webhook in the Meta app pointing at `<APP_URL>/api/webhooks/whatsapp` with your
   verify token; subscribe to `messages`. (The GET handshake + POST handler are built.)
3. Add a WhatsApp channel to a contact: `{ "type": "WHATSAPP", "value": "+9198XXXXXXXX" }`.

**Cost & the template rule (important):**
- **Replies** to someone within 24h of their last message are **free-form and free** — these
  work out of the box via `whatsappChannel.send()`.
- **Proactive greetings** (good morning / festival) are business-initiated, so Meta requires a
  pre-**approved template** and charges per message (~₹0.88–1.09 in India + BSP + GST). Use
  `sendTemplate()` with your approved `WHATSAPP_GREETING_TEMPLATE`. Wiring greetings to use the
  template (instead of plain text) is the one remaining WhatsApp step — see "Known gaps".

### Known gaps (WhatsApp)
- Proactive greetings currently call `send()` (text), which Meta rejects outside the 24h window.
  To send daily/festival greetings on WhatsApp, wire the greeting path to `sendTemplate()` with
  your approved template. Replies need no change. (To save cost, keep daily greetings on free
  SMS/email and reserve WhatsApp templates for festivals + closest people.)

## Roadmap
- ✅ **Phase 1:** email loop (send + IMAP read), approvals, Telegram, dashboard actions.
- ✅ **Phase 2:** SMS via Android gateway (`src/lib/channels/sms.ts` + `/api/webhooks/sms`).
- ✅ **Phase 3:** festival/Jayanti + birthday engine (Calendarific) and add-contact UI.
- ✅ **Phase 4:** WhatsApp Cloud API channel + webhook (`whatsapp.ts` + `/api/webhooks/whatsapp`);
  proactive-greeting template wiring is the remaining config step.
- **Polish:** long-term conversation memory; contact edit/delete + festivals/calendar view on the dashboard.

> Recommendation: run each new contact in `SUPERVISED` for a week, confirm the replies
> sound like you, then switch to `FULL_AUTO`. Protects the relationships this is built for.
