import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/engine";
import { buildVoiceSystemPrompt, greetingUserPrompt, replyUserPrompt } from "@/lib/ai/prompt";
import { sendNow } from "@/lib/deliver";
import { notifyOperator } from "@/lib/notify";
import type { GreetingJob, InboundJob } from "@/lib/queue";

const CONFIDENCE_THRESHOLD = 0.6;

async function settings() {
  return (await prisma.setting.findFirst()) ?? (await prisma.setting.create({ data: { id: 1 } }));
}

function primaryChannel(contact: { channels: { type: any; value: string; isPrimary: boolean }[] }) {
  return contact.channels.find((c) => c.isPrimary) ?? contact.channels[0];
}

/** Outbound: a scheduled greeting (good morning / evening / festival). */
export async function processGreeting(job: GreetingJob) {
  const s = await settings();
  if (s.killSwitch) return;

  const contact = await prisma.contact.findUnique({
    where: { id: job.contactId },
    include: { toneProfile: true, channels: true },
  });
  if (!contact || !contact.active) return;
  const ch = primaryChannel(contact);
  if (!ch) return;

  const { text, escalate } = await generate(
    buildVoiceSystemPrompt(contact),
    greetingUserPrompt(job.slot, job.festival)
  );

  // DEFAULT = approve everything. A greeting only auto-sends if you've explicitly
  // loosened THIS contact past SUPERVISED. Otherwise it waits for your tap.
  const autoSend = contact.autonomy !== "SUPERVISED" && !escalate;
  const status = autoSend ? "QUEUED" : escalate ? "HELD" : "AWAITING_APPROVAL";

  const msg = await prisma.message.create({
    data: {
      contactId: contact.id,
      channel: ch.type,
      direction: "OUT",
      body: text,
      aiGenerated: true,
      status,
    },
  });

  if (autoSend) {
    await sendNow(msg.id).catch((e) => console.error("[greeting] send failed:", e));
  } else {
    await notifyOperator({
      messageId: msg.id,
      contactName: contact.name,
      relationship: contact.relationship,
      channel: ch.type,
      body: text,
      reason: escalate ? "held" : "awaiting_approval",
    });
  }
}

/** Inbound: their reply arrived; draft + (by default) wait for your approval. */
export async function processInbound(job: InboundJob) {
  const s = await settings();
  if (s.killSwitch) return;

  const incoming = await prisma.message.findUnique({ where: { id: job.messageId } });
  if (!incoming) return;

  const contact = await prisma.contact.findUnique({
    where: { id: incoming.contactId },
    include: { toneProfile: true, channels: true },
  });
  if (!contact || !contact.active) return;
  const ch = primaryChannel(contact);
  if (!ch) return;

  const history = await prisma.message.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "asc" },
  });

  const { text, escalate, confidence } = await generate(
    buildVoiceSystemPrompt(contact),
    replyUserPrompt(history)
  );

  // A reply auto-sends ONLY if you set this contact to FULL_AUTO and the AI is
  // confident and didn't flag it. Everything else waits for you.
  const autoSend =
    contact.autonomy === "FULL_AUTO" && !escalate && confidence >= CONFIDENCE_THRESHOLD;
  const status = autoSend ? "QUEUED" : escalate ? "HELD" : "AWAITING_APPROVAL";

  const reply = await prisma.message.create({
    data: {
      contactId: contact.id,
      channel: ch.type,
      direction: "OUT",
      body: text,
      aiGenerated: true,
      confidence,
      status,
    },
  });

  if (autoSend) {
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
