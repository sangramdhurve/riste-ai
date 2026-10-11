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
├── prisma/schema.prisma    # Contact, ContactChannel, ToneProfile, Note, Message, Setting
├── prisma/migrations/      # committed migrations (applied on worker start in Docker)
├── prisma/seed.ts
└── src/
    ├── app/                # Next.js dashboard + API
    │   ├── page.tsx        # Activity feed + "Needs your attention"
    │   ├── contacts/       # Contacts view; contacts/[id] = per-person notebook
    │   └── api/            # contacts, webhooks/inbound, messages/approve, settings/killswitch
    ├── lib/
    │   ├── db.ts           # Prisma client
    │   ├── queue.ts        # BullMQ queue + Redis
    │   ├── ai/             # engine.ts (providers) + prompt.ts (your voice + notebook notes)
    │   ├── notes/          # notebook: which notes drafts may use, private-topic check, validation
    │   └── channels/       # types.ts (interface) + email.ts + index.ts (registry)
    └── worker/             # env.ts (loads .env first), index.ts, scheduler.ts, processors.ts
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
npm test                      # unit tests
```

If ports 5432/6379 are already taken by another project, set `RISTE_DB_PORT` / `RISTE_REDIS_PORT`
in `.env` (e.g. 5433 / 6380) and point `DATABASE_URL` / `REDIS_URL` at the same ports.

To use local AI: `docker compose up -d ollama && docker exec -it <ollama> ollama pull llama3.1:8b`,
or set `AI_PROVIDER=groq` / `gemini` with the matching API key in `.env`.

## Run everything in Docker (VPS)
```bash
docker compose up -d --build
# The worker runs `prisma migrate deploy` before it starts, so the schema is created/updated
# automatically from the committed migrations in prisma/migrations.
```

## Production: HTTPS, auth, backups
- **Caddy** (in compose) gives automatic HTTPS + basic-auth on the dashboard. Point
  `RISTE_DOMAIN`'s DNS at the VPS, set `BASICAUTH_USER` and `BASICAUTH_HASH`
  (`docker run --rm caddy caddy hash-password --plaintext 'pw'`). Webhooks under
  `/api/webhooks/*` are intentionally left open — they verify their own secrets.
- **Backups (S3):** `scripts/backup.sh` does `pg_dump` → gzip → S3 and prunes >14 days.
  Add a host cron: `0 3 * * * cd /path/riste-app && set -a && . ./.env && ./scripts/backup.sh`.
  Restore with `scripts/restore.sh riste-YYYYMMDD-HHMMSS.sql.gz`.
  (Needs `postgresql-client` + `awscli` on the host.)

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
- **No dashboard auth** — single-operator; run behind your VPS auth (e.g. Caddy basic-auth).
- SMS, festival engine, and WhatsApp need external accounts/devices — see roadmap.

## Relationship notebook (Phase 5)
Each contact has a notebook at **Contacts → 📓** (`/contacts/<id>`). Three kinds of note:
**Remember** (facts: kids' names, likes, job), **Event** (with a date: exam, trip, surgery) and
**Promise** (what you said you'd do, optional due date). Mark notes done, edit, delete, or
**Forget everything about <name>** to wipe all their notes (messages and settings stay).

How drafts use them:
- Only **active, non-private** notes reach the AI, quoted as background facts (never instructions).
  Dated events are included from 7 days before to 14 days after; facts and promises are capped.
- An event **today or tomorrow** is worked into that day's greeting ("good luck with the exam").
- **Private notes** (health, grief, money, conflict) are never used in any message. Notes that look
  personal are made private automatically (English + Hindi keyword check); untick if it's fine.
- Notes are kept when someone replies STOP; they're your memory, not a way to message them.

API: `GET|POST|DELETE /api/contacts/<id>/notes` (list / add `{kind, text, eventDate?, sensitive?}` /
forget all), `PATCH|DELETE /api/notes/<noteId>` (edit any field or `{status: "DONE"|"ACTIVE"}`).

### Reminders (step 2)
Every day at **09:30 in each contact's timezone** (`Setting.reminderTime`), the worker checks the
notebook and creates reminders. They appear at the top of the dashboard and, if Telegram is set up,
as a Telegram message with buttons. If the worker starts late it catches up the same day; each
note reminds at most once a day.

| Note | Reminds you |
|---|---|
| Event | on the day ("Today: exam. Send a quick message?") and the day after ("ask how it went") |
| Private event (health, grief…) | also one week later ("check in on them") |
| Promise with a due date | on the due date, 3 days late, then weekly until done |
| Promise without a date | 3 days after you noted it, then weekly until done |

Actions (dashboard or Telegram): **Done** (on a promise this also marks the promise kept),
**Draft a message** (an AI draft in your voice that waits in *Needs your attention*; reminder
drafts always need your approval, whatever the contact's autonomy; not offered for private notes),
**Snooze** (tomorrow / next week; the note stays quiet until then and reminds once on that day),
**Dismiss**. API: `POST /api/reminders/<id> {action: "done"|"draft"|"snooze"|"dismiss", days?: 1|7}`.

### Suggested notes (step 3)
Riste reads conversations and **suggests** notes; nothing is used until you keep it.
- **Their messages:** after the reply draft is under way, a lower-priority job (15 s later, behind
  other work) reads each incoming message and suggests up to 3 facts or events about them.
- **What you send:** every message sent in your name (including approved AI drafts) is read for
  promises you made ("I'll send you the book this weekend" → Promise, due Saturday).
- Suggestions appear under **Notes to review** on the home page and **Suggested from messages** on
  the contact's page, with the message they came from. **Keep** (edit kind/text/date/private first
  if needed) or **Not useful**. Dismissed suggestions are remembered and not suggested again.
- Safety: incoming messages are treated as data; they can never create a promise; suggestions with
  links or long numbers are dropped; messages that try to instruct the AI ("ignore previous
  instructions…") are skipped; short messages ("ok 👍") are skipped; money/health/grief/conflict
  suggestions are private. The model gets a two-week calendar so "next Monday" resolves correctly.

### Running the pilot (step 4)
The goal and success criteria are in the architecture doc (§9, Phase 5). **Metrics → Notebook
pilot** scores them live; **Ready for the pilot?** below it shows what still needs setting up.

Before you start:
1. **Email:** put your real Gmail address and a Gmail *app password* in `.env`
   (`SMTP_USER`, `SMTP_PASS`; `IMAP_HOST` for reading replies). "Reading replies" turns green
   within a minute of the worker restarting.
2. **Phone notifications:** create a Telegram bot, set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`,
   and register the webhook (see *Your controls* above). Approvals and reminders then reach your phone.
3. **2–3 real contacts:** add them with at least 3 of your real past messages each, and grant
   consent on their channel. Keep them `SUPERVISED`.
4. **Keep the worker running** for the whole two weeks ("Background service" must stay green).
5. Press **Start the two-week pilot**. Only activity after that counts, so testing beforehand never
   skews the result. You can restart or stop it from the same place.

During the pilot: review **Notes to review** and **Reminders** on the home page as they come in.
Reminders left open for 7 days count as ignored.

| Criterion | Target | How it's measured |
|---|---|---|
| Useful memory | ≥ 70% | suggestions kept ÷ suggestions you decided on |
| Useful reminders | ≥ 50% | reminders marked done or drafted ÷ (acted + dismissed + ignored); snoozes don't count |
| Real contact | ≥ 3 | messages drafted from a reminder that actually went out |
| Safety | 0 | messages sent without your approval that mention one of that contact's private notes |

The verdict waits for 10 suggestion decisions and 10 handled reminders, and is only final after day 14.

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
- ✅ **Polish:** contact edit/delete + pause + autonomy controls; festivals **/calendar** view;
  yearly festival auto-refresh in the worker; Caddy HTTPS + basic-auth; S3 backup/restore scripts.
  *Remaining: template-wired WhatsApp greetings.*
- 🚧 **Phase 5 — relationship notebook:** ✅ step 1 (manual notebook, notes in drafts);
  ✅ step 2 (daily reminders + promise nudges on dashboard and Telegram);
  ✅ step 3 (notes suggested from messages, kept only when you confirm);
  ✅ step 4 tooling (pilot scoring, readiness checks, start/stop); next: run the two-week pilot.

> Recommendation: run each new contact in `SUPERVISED` for a week, confirm the replies
> sound like you, then switch to `FULL_AUTO`. Protects the relationships this is built for.
