import { prisma } from "@/lib/db";
import { getChannel } from "@/lib/channels";
import { logEvent } from "@/lib/analytics";
import { canSend } from "@/lib/guardrails";
import { recordAudit } from "@/lib/audit";
import { notifyOperator } from "@/lib/notify";
import { queueNoteSuggestions } from "@/lib/notes/suggest";

/**
 * Single place that actually sends a message and records the result.
 * Used by: the worker (auto path), the dashboard approve button, and the
 * Telegram approve button — so "send" behaves identically everywhere.
 *
 * `manual` = true means a human explicitly approved this send. Hard legal stops
 * (kill switch, opt-out, consent) still apply; courtesy limits (quiet hours,
 * rate cap) are bypassed because you chose to send it now.
 *
 * On a guardrail block this does NOT throw — it parks the message as HELD with
 * a reason and returns it, so callers can surface why nothing went out.
 */
export async function sendNow(messageId: string, overrideBody?: string, opts?: { manual?: boolean }) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { contact: { include: { channels: true } } },
  });
  if (!msg) throw new Error("message not found");
  // Idempotent: never re-send something already sent (double approve/tap).
  if (msg.status === "SENT" || msg.status === "DELIVERED" || msg.status === "READ") return msg;
  if (msg.status === "REJECTED") throw new Error("message was rejected");

  const ch =
    msg.contact.channels.find((c) => c.type === msg.channel && c.isPrimary) ??
    msg.contact.channels.find((c) => c.type === msg.channel);
  if (!ch) throw new Error("no channel for message");

  const manual = opts?.manual ?? false;
  const guard = await canSend({
    contactId: msg.contactId,
    timezone: msg.contact.timezone,
    channel: msg.channel,
    consentStatus: ch.consentStatus,
    optedOutAt: ch.optedOutAt,
    manual,
  });
  if (!guard.ok) {
    const held = await prisma.message.update({
      where: { id: messageId },
      data: { status: "HELD", heldReason: guard.reason },
    });
    logEvent({ type: "held", messageId, contactId: msg.contactId, channel: msg.channel, meta: { reason: guard.reason } });
    // On the automatic path, surface why it was blocked so it doesn't vanish.
    if (!manual) {
      await notifyOperator({
        messageId,
        contactName: msg.contact.name,
        relationship: msg.contact.relationship,
        channel: msg.channel,
        body: overrideBody ?? msg.body,
        reason: "held",
      }).catch(() => {});
    }
    return held;
  }

  const text = overrideBody ?? msg.body;
  // Per-recipient unsubscribe link for email (also exposed as List-Unsubscribe).
  const unsubscribeUrl =
    msg.channel === "EMAIL" && process.env.APP_URL
      ? `${process.env.APP_URL}/api/unsubscribe?c=${ch.id}`
      : undefined;

  try {
    const { externalId } = await getChannel(msg.channel).send(ch.value, text, {
      subject: "Hi 👋",
      unsubscribeUrl,
    });
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { body: text, status: "SENT", sentAt: new Date(), externalId },
    });
    logEvent({ type: "sent", messageId, contactId: msg.contactId, channel: msg.channel });
    recordAudit({
      contactId: msg.contactId,
      channel: msg.channel,
      direction: "OUT",
      body: text,
      externalId,
      aiGenerated: msg.aiGenerated,
    });
    // Anything sent in the user's name may contain a promise worth tracking.
    await queueNoteSuggestions(messageId, text).catch((e) => console.error("[notes] queue failed:", e));
    return updated;
  } catch (err) {
    await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } });
    logEvent({
      type: "failed",
      messageId,
      contactId: msg.contactId,
      channel: msg.channel,
      meta: { error: String(err) },
    });
    throw err;
  }
}
