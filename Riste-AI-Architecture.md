# Riste AI — Architecture & Roadmap

*An AI relationship manager that keeps your important people warm — automatically.*

**Author:** Sangram Dhurve
**Date:** June 2, 2026
**Status:** Design v1

---

## 1. What Riste AI is

**Riste** (रिश्ते — "relationships") is a personal system that manages your real relationships at scale. For each person you care about, you store their contact details, your relationship to them, and how you usually talk to them. Riste then:

1. Sends scheduled check-ins automatically (good morning, good evening, "thinking of you", festival wishes) on the right channel.
2. Reads their replies as they come in.
3. Writes and sends a reply **in your voice** — mimicking how *you* text that specific person.

The whole point is that it should feel genuine: like *you* stayed in touch, not a bot.

### The control principle (read this first)

**The human is in control by default. Nothing sends without your approval.** Every message —
greeting *and* reply — is drafted by the AI in your voice and then **waits for your tap**. You
get pinged (Telegram, with Approve/Reject buttons, plus the dashboard queue) and decide to
approve, edit, regenerate, or reject. You can *optionally* loosen any individual contact to
auto-send later once you trust how it sounds — but the system never assumes that for you.

This is the safeguard that keeps automation from becoming "fake." Two more things must hold:

- **Per-person voice, not generic.** A reply to your mother must sound nothing like a reply to a college friend. Riste stores tone notes + your real past messages per contact and conditions every message on them. This is what separates Riste from a spam scheduler.
- **A supervision dial — defaults to fully supervised.** Each contact has an `autonomy` setting: `supervised` (the default — AI drafts, you approve *everything*), `auto-greetings` (greetings auto, replies approved), or `full-auto` (replies auto-send only when confident & unflagged). New contacts always start at `supervised`. You opt a contact into more autonomy deliberately, per person, once you've seen its drafts sound like you.

A wrong-sounding message to someone you love is the one failure mode that breaks trust permanently — so the default removes that risk entirely. Even when you loosen a contact, the system stays safe via (a) per-person voice, (b) a confidence threshold that holds uncertain replies, and (c) hard guardrails on sensitive content (see §7).

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        RISTE AI                                │
│                                                                │
│   ┌─────────────┐      ┌──────────────┐     ┌──────────────┐   │
│   │   Web UI    │◄────►│  FastAPI     │◄───►│   SQLite DB  │   │
│   │ (dashboard) │      │  (core app)  │     │ contacts,    │   │
│   └─────────────┘      └──────┬───────┘     │ messages,    │   │
│                               │             │ tone profiles│   │
│                               │             └──────────────┘   │
│         ┌─────────────────────┼─────────────────────┐          │
│         ▼                     ▼                     ▼          │
│   ┌───────────┐        ┌─────────────┐       ┌────────────┐    │
│   │ Scheduler │        │  AI Engine  │       │  Channel   │    │
│   │(APScheduler)        │  (Ollama /  │       │  Adapters  │    │
│   │ greetings │        │  Gemini/Groq)│      │  email/SMS/│    │
│   └───────────┘        └─────────────┘       │  WhatsApp  │    │
│                                              └─────┬──────┘    │
└────────────────────────────────────────────────────┼──────────┘
                                                      ▼
                              ┌───────────────────────────────────┐
                              │  Gmail (SMTP/IMAP)                 │
                              │  Android SMS Gateway (your phone)  │
                              │  WhatsApp (later — see risk §7)    │
                              └───────────────────────────────────┘
```

### Components

| Component | Responsibility | Free tool of choice |
|---|---|---|
| **Core app + UI** | API routes, business logic, dashboard | Next.js (TypeScript) |
| **Database** | Contacts, relationships, full message history, per-person tone profiles, settings | PostgreSQL + Prisma ORM |
| **Worker / Scheduler** | Fires daily/weekly outbound jobs at the right local time; processes the send/reply queue | Node worker + BullMQ + Redis |
| **AI engine** | Generates outbound greetings and inbound replies in your voice | Ollama (local) + Gemini/Groq fallback |
| **Channel adapters** | Send/receive on each channel through one common interface | Gmail, Android SMS gateway, (WhatsApp later) |
| **Web UI** | Add/manage contacts, view threads, set autonomy, review escalations | Next.js dashboard |
| **Inbound listener** | Receives incoming messages via webhooks and routes them to the AI | Next.js API route handlers |

A clean **`Channel` interface** (`send(to, text)` + an inbound webhook that normalizes to a common message shape) means email, SMS, and WhatsApp all plug into the same brain. Adding a channel never touches the AI or scheduler code.

---

## 3. Data model

```
Contact
  id, name, relationship_type (mother, friend, partner, colleague…)
  channels: [ {type: email|sms|whatsapp, value, is_primary} ]
  timezone, language
  autonomy: supervised | auto-greetings | full-auto
  greeting_schedule: { morning: "08:00", evening: "21:00", custom: [...] }
  active: bool

ToneProfile (one per contact — this is the "voice")
  contact_id
  sample_messages: [ your real past texts to this person ]
  style_notes: "short, lots of emojis, calls her Aai, never formal"
  language_mix: "Hindi-English mix"
  do_not_say: [ topics/phrases to avoid ]

Message
  id, contact_id, channel, direction (in|out)
  body, status (queued|sent|delivered|failed|awaiting_approval)
  ai_generated: bool, confidence: float
  created_at, sent_at

Setting (global)
  quiet_hours, default_autonomy, ai_provider, kill_switch
```

The **ToneProfile** is the heart of "mimic me." You seed it by pasting some of your real past messages to each person (or importing a chat export). Every message Riste writes is conditioned on that profile so it sounds like how you talk *to that person specifically*.

---

## 4. Message flow

**Outbound (scheduled greeting)**
```
Scheduler fires → load Contact + ToneProfile → AI drafts greeting in your voice
→ if autonomy=full-auto: send via channel adapter
   if supervised: queue as awaiting_approval → notify you
→ log Message
```

**Inbound (their reply)**
```
Channel webhook receives message → store as inbound Message
→ load thread history + ToneProfile → AI drafts reply (+confidence score)
→ if full-auto AND confidence ≥ threshold AND passes guardrails: send
   else: escalate to you for approval
→ log Message
```

The **confidence threshold + guardrails** are what make full-auto safe: anything emotionally loaded, ambiguous, or matching a sensitive trigger (money requests, bad news, conflict, anything in `do_not_say`) is held for you even in full-auto mode.

---

## 5. The AI engine (mimicking your style)

**Primary: Ollama, running locally.** Free, private, and your most personal messages never leave your machine — which matters a lot for relationship content. A model like **Llama 3.1 8B** or **Mistral 7B** runs on a normal laptop (8–16 GB RAM). Style mimicry is done by **few-shot prompting**: the prompt includes the contact's tone notes + a handful of your real past messages, so the model imitates your wording, length, language mix, and nicknames.

**Fallback: free cloud tiers** (for when your laptop is off, or for heavier reasoning):
- **Google Gemini free tier** — ~1,500 requests/day, 1M tokens/min, no card. Caveat: Google may use prompts for training, so avoid it for the most private threads.
- **Groq free tier** — ~30 req/min, 1,000 req/day, extremely fast, no training on your data.

**Upgrade path (optional, later):** once you have a few hundred of your real messages, you can **fine-tune** a small local model on your own texting style for even better mimicry — still free, still local.

**Recommendation:** default to local Ollama; use Gemini/Groq only as a fallback and never for contacts you mark private.

---

## 6. Channels

### Email — free, build first
- **Send:** Gmail SMTP. **Receive:** Gmail IMAP polling or the Gmail API with push.
- Cost: ₹0. Reliability: high. This is your proving ground for the whole pipeline.

### SMS — free via YOUR phone, genuine by design
Don't pay a gateway like Twilio. Install an open-source **Android SMS gateway** app on your own phone; Riste talks to it over a simple API. Messages go out from **your real SIM and number** — which is exactly the genuineness you want — and cost nothing beyond your normal mobile plan.
- Options: **textbee**, **SMSGate**, **android-sms-gateway**, or **Somleng** (Twilio-compatible API).
- Receives incoming SMS too and forwards them to Riste's webhook.

### WhatsApp — high value, but real risk (phase it carefully)
This is the channel most Indian relationships actually live on, so it matters. But be clear-eyed:
- Unofficial libraries (**Baileys**, **whatsapp-web.js**, Evolution API) **violate Meta's Terms of Service**. Bans are unpredictable — you might run for months or get your **personal number permanently deactivated** in a week.
- As of **January 2026**, Meta actively blocks general-purpose AI bots on WhatsApp, increasing detection risk.
- The compliant route is the **WhatsApp Business API**, which is **not free per conversation** and requires business verification.

**My recommendation:** ship email + SMS first (both free and safe). For WhatsApp, either (a) use a **secondary number** you can afford to lose if you go the unofficial route, or (b) budget for the official Business API once the product proves its value. Do not point unofficial automation at your main personal WhatsApp number.

---

## 7. Risks, ethics & guardrails

| Risk | Mitigation |
|---|---|
| Auto-reply sounds wrong → hurts a relationship | Per-person ToneProfile, confidence threshold, supervised onboarding per contact, easy global kill switch |
| WhatsApp number ban | Use email/SMS first; secondary number or official API for WhatsApp |
| Sensitive moment handled by a bot (grief, conflict, money) | Hard guardrail: these always escalate to you, even in full-auto |
| Person feels deceived if they find out | Consider light disclosure for closest relationships; keep the most meaningful exchanges human |
| Privacy of intimate messages | Local Ollama + local SQLite; nothing leaves your machine by default |
| Gemini training on prompts | Mark private contacts "local-only"; never route them to cloud |

**A note on genuineness:** the product is most valuable for the *maintenance* layer of relationships — staying in touch, remembering to check in, festival wishes — where a warm automated nudge is genuinely better than silence. The deepest moments are where a human should show up. Designing Riste to know the difference is what makes it ethical *and* better.

---

## 8. Tech stack summary

| Layer | Choice | Cost |
|---|---|---|
| Language/Backend | Next.js + Node (TypeScript) | Free |
| Database | PostgreSQL + Prisma (Docker, on Hostinger VPS) | Free (own VPS) |
| Scheduler / queue | Node worker + BullMQ + Redis | Free |
| AI (primary) | Ollama + Llama 3.1 8B / Mistral | Free (local) |
| AI (fallback) | Gemini free / Groq free | Free (tiered) |
| Email | Gmail SMTP/IMAP | Free |
| SMS | Open-source Android SMS gateway | Free (your plan) |
| WhatsApp | Unofficial lib (risky) or Business API | Free-but-risky / Paid |
| Frontend | Next.js (dashboard) | Free |
| Hosting | Hostinger VPS, Docker Compose | Already owned |
| Storage/Backup | AWS S3 (backups + media) | Already owned |

**A fully free, genuine v1 is absolutely achievable:** FastAPI + SQLite + APScheduler + Ollama + Gmail + Android SMS gateway.

---

## 9. Phased roadmap

### Phase 1 — Foundation (free) ✅ start here
- FastAPI app + SQLite schema (Contact, ToneProfile, Message, Setting)
- Contact management UI (add person, relationship, channel, schedule, autonomy)
- Ollama integration; tone profile seeding from pasted past messages
- **Email channel** end to end: scheduled greetings + read replies + auto-reply
- Kill switch + per-contact autonomy dial
- *Outcome: a working relationship manager over email, costing ₹0.*

### Phase 2 — SMS (free) ✅ built
- ✅ Android SMS gateway integration (`channels/sms.ts`) — sends from your real number
- ✅ Inbound SMS webhook (`/api/webhooks/sms`) → AI reply pipeline, sender matched by last 10 digits
- ✅ Timezone-aware scheduling, confidence threshold + guardrails (shared with email)
- *Outcome: SMS from your real number, drafted in your voice, gated by your approval.*

### Phase 3 — Intelligence & polish (festival engine ✅ built)
- ✅ Festival/Jayanti/birthday auto-detection (Calendarific yearly pull + per-contact tags + manual curation); festival wish replaces the morning greeting
- ✅ Add-contact UI with tone-profile seeding (no command line needed)
- ✅ Escalations queue + "needs your attention" with approve/edit/regenerate/reject
- *Remaining:* long-term conversation memory, optional fine-tuned local model, contact edit/delete UI

### Phase 4 — WhatsApp (official Cloud API ✅ built)
- ✅ WhatsApp Cloud API adapter behind the same Channel interface (`channels/whatsapp.ts`): `send()` for replies, `sendTemplate()` for proactive
- ✅ Webhook (`/api/webhooks/whatsapp`): verification handshake, inbound messages, and delivery/read status updates
- *Remaining config:* approve a greeting **template** and wire the proactive-greeting path to `sendTemplate()` (per-message cost applies); replies in the 24h window are free
- Reminder: keep daily greetings on free SMS/email; reserve paid WhatsApp templates for festivals + closest people

---

## 10. Deployment (Hostinger VPS + Docker + S3)

Since you already have a VPS and an S3 bucket, Riste runs **24/7 on the VPS** (not your laptop) as a set of Docker containers orchestrated by Docker Compose:

```
Hostinger VPS  (Docker Compose)
├── riste-web          Next.js (dashboard + API routes + webhooks)
├── riste-worker       Node worker (BullMQ): scheduler + send/reply jobs
├── riste-db           PostgreSQL  (volume-mounted)
├── riste-redis        Redis (BullMQ queue)
├── ollama             local LLM server (if VPS has RAM/GPU; else use Gemini/Groq)
└── caddy / nginx      reverse proxy + free HTTPS (Let's Encrypt)
```

Both `riste-web` and `riste-worker` share the same TypeScript codebase (one repo, two entry points) — `next start` for the web, `node worker` for the background process.

**AWS S3 — what it's for:**
- **Database backups / restore:** a nightly cron `pg_dump` → gzipped → uploaded to S3. "Restoring the data" = pull the latest dump from S3 and `pg_restore`. This is your disaster recovery.
- **Media & attachments:** any images/voice notes sent or received (especially on WhatsApp) are stored in S3, and the DB just keeps the S3 URL — keeps the database small.
- **Message archive:** optional cold archive of old threads.

**Ollama on the VPS:** only if the VPS has enough RAM (8 GB+ for a 7–8B model) and ideally a GPU. Most cheap Hostinger VPS plans are CPU-only and will run a small model *slowly*. Practical recommendation: **run Ollama for non-urgent batch jobs (drafting greetings overnight), and use Groq/Gemini free tier for real-time replies** where speed matters. The AI engine picks the provider per task.

**Secrets** (Gmail app password, WhatsApp token, S3 keys, API keys) live in a `.env` / Docker secrets — never in the code or repo.

---

## 11. The operator dashboard — "who, what, when, whom" (your main question)

This is how *you* (the first person / operator) see everything Riste is doing. Built in **Next.js**, served from the VPS. Five core views:

**1. Today / Activity feed (home).** A live, reverse-chronological log answering exactly your question:
> *"9:01 AM — ✅ Sent to **Aai** (Mother) via WhatsApp: 'Good morning Aai 🌸…'"*
> *"9:03 AM — 📥 Reply from **Rohan** (Friend) via SMS: 'haha all good bro'"*
> *"9:03 AM — 🤖 Auto-replied to **Rohan**: 'glad to hear 😄 catch up soon'"*
> *"10:15 AM — ⚠️ **Held for you** — Priya (Partner) sent something emotional"*

Each row shows: **time · whom · relationship · channel · direction · status · the actual message text**. Color-coded status (✅ delivered, 🕒 queued, 🤖 auto-sent, ⚠️ needs you, ❌ failed). This single screen is the answer to "when, what, which, and whom."

**2. Needs Your Attention (escalations queue).** Everything full-auto decided *not* to handle alone — emotional messages, low-confidence replies, "let's meet"/"call me" type requests, anything matching a guardrail. You see their message + the AI's suggested human action ("Suggest: call Priya this evening") and can approve a draft, write your own, or snooze.

**3. Contacts.** Grid of everyone, with per-person: relationship, channels, autonomy dial (supervised / auto-greetings / full-auto), schedule, last contact, and a health indicator ("haven't really talked in 12 days").

**4. Conversation view.** Full WhatsApp-style thread per contact, with AI-generated messages subtly marked so you always know what was you vs. auto.

**5. Calendar & cost.** Upcoming festivals/Jayantis and who'll get wished (see §12), plus a running WhatsApp spend meter for the month (see §13).

**Delivery tracking is real, not guessed:** each channel reports delivery status back — WhatsApp sends delivery/read webhooks, the Android SMS gateway reports sent/delivered, and email tracks send + (optionally) open. Riste writes these to the `Message.status` field so the dashboard shows true state, not just "we tried."

A push/notification fires whenever a draft is ready or something lands in **Needs Your Attention**, so you're never blind.

### Operator controls (the human is in charge)

**Approval actions on every draft:** Approve & send · Edit then send · Regenerate (new draft) · Reject · Snooze.

**Notifications — approve without opening the app:**
- **Telegram (built):** each draft arrives as a chat message with **Approve / Reject** buttons; tapping acts immediately via the Telegram webhook. Free and instant.
- **Dashboard (built):** the "Needs Your Attention" queue.
- **WhatsApp-to-self (planned, Phase 4):** ping your own number — uses the paid WhatsApp API.

**Global controls:** kill switch (stop everything) · default autonomy · quiet hours · AI provider · confidence threshold.

**Per-contact controls:** add/edit/pause/delete · relationship · channels & primary · autonomy dial · greeting schedule & timezone · festival tags · tone profile (samples, style notes, language, do-not-say).

**Always reversible:** in one tap you can pause a contact, flip them back to supervised, or hit the global kill switch — even if you'd previously set them to auto.

---

## 12. Festival & special-events engine (Gandhi Jayanti, Holi, Diwali…)

You're right that the Indian calendar has *something* almost every day. Riste handles this with a dedicated events engine:

**Source of dates — recommended: pre-fetch once a year, cache locally.**
- **Calendarific API** — REST holiday API covering India (national, religious, observances, many Jayantis). Free tier is small (≈500–1,000 calls), but you only need to call it **once per year per region** and store the whole year in your DB. So free tier is plenty.
- **Google Calendar "Holidays in India"** — the public holiday calendar (`...holiday@group.v.calendar.google.com`) read via the Google Calendar API. Free, good for mainstream public holidays, but **lighter on the many minor Jayantis** than Calendarific.
- **Best of both:** use Calendarific as the primary yearly pull, and let yourself **manually add/curate** the specific Jayantis and personal dates (birthdays, anniversaries) you care about — because no API perfectly matches *your* list of who-celebrates-what.

**How it behaves (matching what you described):**
1. Each morning the engine checks "is today a special day?"
2. If yes, contacts who celebrate it (you tag contacts with which festivals apply — e.g. tag Hindu festivals, regional ones, personal anniversaries) get a **short, minimalistic festival greeting** in your voice instead of the generic good-morning ("Happy Diwali Aai 🪔 love you").
3. **Important:** a festival greeting is still just a nudge. If they reply with something that needs *you* — "come home for Diwali", "let's meet", "call me" — that **escalates to Needs Your Attention** with a suggested human action. The bot stays minimalistic; the real moments come back to you.

Festivals are tagged per-contact so you don't wish "Eid Mubarak" to the wrong person or spam every minor Jayanti to everyone — only the ones you've opted that contact into.

---

## 13. WhatsApp cost breakdown (2026, India)

WhatsApp is the one channel that costs per message. As of **2026** Meta moved to **per-template-message** pricing. India rates (Meta's charge, before BSP markup + 18% GST):

| Message type | When it applies in Riste | Approx. cost (India) |
|---|---|---|
| **Marketing template** | Proactive "good morning", festival wishes — likely classed marketing | **~₹0.88–1.09 / msg** |
| **Utility template** | Only if a message qualifies as transactional (rarely for us) | ~₹0.11–0.145 / msg |
| **Service message** | **Your auto-reply to their incoming message, within 24h** | **FREE** |

**What this means for Riste:** the **replies are essentially free** (they fall in the 24-hour service window once the person messages you). The cost is the **proactive daily/festival greetings**, which are business-initiated templates.

**Rough monthly estimate** (greetings only, replies free):

| WhatsApp contacts | 1 greeting/day each | Meta cost/month @ ~₹1 | + BSP markup + 18% GST |
|---|---|---|---|
| 10 | 300 msgs | ~₹300 | ~₹400–450 |
| 25 | 750 msgs | ~₹750 | ~₹1,000–1,100 |
| 50 | 1,500 msgs | ~₹1,500 | ~₹2,000–2,200 |

You also need a **BSP** (Business Solution Provider like AiSensy, Wati, Interakt) or direct Cloud API access, plus a verified WhatsApp Business account. Two ways to cut cost: send proactive greetings **less than daily** on WhatsApp (e.g. only festivals + weekly), and route plain daily good-mornings to **free SMS/email** instead — reserve paid WhatsApp templates for the people and moments that matter most.

> Numbers vary by BSP and Meta's periodic rate changes — treat these as planning estimates and confirm with your chosen BSP before scaling.

---

## 14. Updated tech stack (with your infrastructure)

| Layer | Choice |
|---|---|
| Backend + Frontend | **Next.js (TypeScript)** — one codebase, Docker |
| Background worker | **Node + BullMQ + Redis** (scheduler & jobs) |
| ORM / Database | **Prisma + PostgreSQL** (Docker volume on VPS) |
| Hosting | **Hostinger VPS** + Docker Compose + Caddy/Nginx HTTPS |
| Backups / media | **AWS S3** (nightly pg_dump, attachments) |
| AI | **Ollama** (batch/private) + **Groq/Gemini free** (real-time) |
| Email | Gmail SMTP/IMAP (free) |
| SMS | Android SMS gateway on your phone (free) |
| WhatsApp | Official Cloud API via a BSP (paid per template) |
| Festivals | Calendarific (yearly pull) + manual curation |

---

## 15. What I need from you to start building

1. **Pick 2–3 starter contacts** for Phase 1 (e.g., one family, one friend) with their email addresses.
2. For each, a handful of **your real past messages** to them (so the tone profile sounds like you).
3. The **greeting times** you want and in what language/mix.
4. Confirm where Riste will run (your laptop to start is fine).

When you're ready, say the word and I'll scaffold the Phase 1 codebase.
