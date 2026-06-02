import { prisma } from "@/lib/db";
import { getChannel } from "@/lib/channels";

/**
 * Single place that actually sends a message and records the result.
 * Used by: the worker (auto path), the dashboard approve button, and the
 * Telegram approve button — so "send" behaves identically everywhere.
 */
export async function sendNow(messageId: string, overrideBody?: string) {
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

  const text = overrideBody ?? msg.body;
  try {
    const { externalId } = await getChannel(msg.channel).send(ch.value, text, { subject: "Hi 👋" });
    return prisma.message.update({
      where: { id: messageId },
      data: { body: text, status: "SENT", sentAt: new Date(), externalId },
    });
  } catch (err) {
    await prisma.message.update({ where: { id: messageId }, data: { status: "FAILED" } });
    throw err;
  }
}
