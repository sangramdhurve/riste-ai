import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/engine";
import { buildVoiceSystemPrompt, greetingUserPrompt, replyUserPrompt } from "@/lib/ai/prompt";
import { sendNow } from "@/lib/deliver";
import { notifyOperator } from "@/lib/notify";
import { logEvent } from "@/lib/analytics";
import { getSetting } from "@/lib/settings";
import { decideSend } from "@/lib/autonomy";
import type { GreetingJob, InboundJob } from "@/lib/queue";

function primaryChannel(contact: { channels: { type: any; value: string; isPrimary: boolean }[] }) {
  return contact.channels.find((c) => c.isPrimary) ?? contact.channels[0];
}

/** Outbound: a scheduled greeting (good morning / evening / festival). */
export async function processGreeting(job: GreetingJob) {
  const s = await getSetting();
  if (s.killSwitch) return;

  const contact = await prisma.contact.findUnique({
    where: { id: job.contactId },
    include: { toneProfile: true, channels: true },
  });
  if (!contact || !contact.active) return;
  const ch = primaryChannel(contact);
  if (!ch) return;

  const t0 = Date.now();
  const { text, escalate } = await generate(
    buildVoiceSystemPrompt(contact),
    greetingUserPrompt(job.slot, job.festival)
  );
  const latencyMs = Date.now() - t0;

  // Optionally disclose AI assistance on proactive greetings (off by default).
  const body = s.aiDisclosure && s.disclosureText ? `${text}\n\n${s.disclosureText}` : text;

  // DEFAULT = approve everything. A greeting only auto-sends if you've explicitly
  // loosened THIS contact past SUPERVISED. Escalations always wait for a human.
  const { autoSend, status } = decideSend({ autonomy: contact.autonomy, kind: "greeting", escalate });

  const msg = await prisma.message.create({
    data: {
      contactId: contact.id,
      channel: ch.type,
      direction: "OUT",
      body,
      originalBody: body,
      aiGenerated: true,
      status,
      heldReason: escalate ? "escalate" : null,
    },
  });

  logEvent({
    type: "draft_created",
    messageId: msg.id,
    contactId: contact.id,
    channel: ch.type,
    meta: { kind: "greeting", slot: job.slot, festival: job.festival ?? null, latencyMs, escalate, autoSend },
  });
  if (status === "HELD") {
    logEvent({ type: "held", messageId: msg.id, contactId: contact.id, channel: ch.type, meta: { reason: "escalate" } });
  }

  if (autoSend) {
    logEvent({ type: "auto_sent", messageId: msg.id, contactId: contact.id, channel: ch.type });
    await sendNow(msg.id).catch((e) => console.error("[greeting] send failed:", e));
  } else {
    await notifyOperator({
      messageId: msg.id,
      contactName: contact.name,
      relationship: contact.relationship,
      channel: ch.type,
      body,
      reason: escalate ? "held" : "awaiting_approval",
    });
  }
}

/** Inbound: their reply arrived; draft + (by default) wait for your approval. */
export async function processInbound(job: InboundJob) {
  const s = await getSetting();
  if (s.killSwitch) return;

  const incoming = await prisma.message.findUnique({ where: { id: job.messageId } });
  if (!incoming) return;

  const contact = await prisma.contact.findUnique({
    where: { id: incoming.contactId },
    include: { toneProfile: true, channels: true },
  });
  if (!contact || !contact.active) return;
  // Reply on the channel their message actually arrived on (they may have
  // written on a non-primary channel); fall back to primary only if needed.
  const ch =
    contact.channels.find((c) => c.type === incoming.channel && c.isPrimary) ??
    contact.channels.find((c) => c.type === incoming.channel) ??
    primaryChannel(contact);
  if (!ch) return;

  // Only real conversation: their messages + replies we actually SENT.
  // Excludes unsent/rejected drafts, and is capped so we don't blow up tokens.
  const recent = await prisma.message.findMany({
    where: {
      contactId: contact.id,
      OR: [{ direction: "IN" }, { status: { in: ["SENT", "DELIVERED", "READ"] } }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const history = recent.reverse();

  const t0 = Date.now();
  const { text, escalate, confidence } = await generate(
    buildVoiceSystemPrompt(contact),
    replyUserPrompt(history)
  );
  const latencyMs = Date.now() - t0;

  // A reply auto-sends ONLY if you set this contact to FULL_AUTO and the AI is
  // confident and didn't flag it. Everything else waits for you.
  const { autoSend, status } = decideSend({
    autonomy: contact.autonomy,
    kind: "reply",
    escalate,
    confidence,
  });

  const reply = await prisma.message.create({
    data: {
      contactId: contact.id,
      channel: ch.type,
      direction: "OUT",
      body: text,
      originalBody: text,
      aiGenerated: true,
      confidence,
      status,
      heldReason: escalate ? "escalate" : null,
    },
  });

  logEvent({
    type: "draft_created",
    messageId: reply.id,
    contactId: contact.id,
    channel: ch.type,
    meta: { kind: "reply", confidence, latencyMs, escalate, autoSend },
  });
  if (status === "HELD") {
    logEvent({ type: "held", messageId: reply.id, contactId: contact.id, channel: ch.type, meta: { reason: "escalate" } });
  }

  if (autoSend) {
    logEvent({ type: "auto_sent", messageId: reply.id, contactId: contact.id, channel: ch.type });
    await sendNow(reply.id).catch((e) => console.error("[inbound] send failed:", e));
  } else {
    await notifyOperator({
      messageId: reply.id,
      contactName: contact.name,
      relationship: contact.relationship,
      channel: ch.type,
      body: text,
      reason: escalate ? "held" : "awaiting_approval",
    });
  }
}
