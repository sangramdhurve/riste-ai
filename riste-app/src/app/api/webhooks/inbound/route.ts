import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";
import { recordInboundReply } from "@/lib/analytics";
import { isOptOut } from "@/lib/optout";
import { recordAudit } from "@/lib/audit";

/**
 * Inbound messages land here. The email poller, SMS gateway, and (later)
 * WhatsApp webhook all POST the same normalized shape:
 *   { secret, channel, body, contactId? , from?, externalId? }
 * Identify the sender by `contactId` if known, otherwise by `from` (their
 * email/phone), which we match against ContactChannel.
 */
export async function POST(req: Request) {
  const b = await req.json();
  if (b.secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!b.channel || !b.body || (!b.contactId && !b.from)) {
    return NextResponse.json({ error: "need channel, body, and contactId or from" }, { status: 400 });
  }

  // Idempotency: skip if we've already stored this provider message id.
  if (b.externalId) {
    const seen = await prisma.message.findFirst({ where: { externalId: b.externalId } });
    if (seen) return NextResponse.json({ ok: true, duplicate: true });
  }

  let contactId = b.contactId as string | undefined;
  let channelId: string | undefined;
  if (!contactId && b.from) {
    const ch = await prisma.contactChannel.findFirst({
      where: { type: b.channel, value: b.from },
    });
    if (!ch) return NextResponse.json({ error: "unknown sender" }, { status: 404 });
    contactId = ch.contactId;
    channelId = ch.id;
  }

  const cleanText = String(b.body).trim();
  const message = await prisma.message.create({
    data: {
      contactId: contactId!,
      channel: b.channel,
      direction: "IN",
      body: cleanText,
      status: "DELIVERED",
      externalId: b.externalId ?? null,
    },
  });
  recordAudit({ contactId: contactId!, channel: b.channel, direction: "IN", body: cleanText, externalId: b.externalId });

  // Honour opt-out: flip consent on the matching channel and do NOT draft a reply.
  if (isOptOut(cleanText)) {
    if (!channelId) {
      const ch = await prisma.contactChannel.findFirst({
        where: { contactId: contactId!, type: b.channel },
      });
      channelId = ch?.id;
    }
    if (channelId) {
      await prisma.contactChannel.update({
        where: { id: channelId },
        data: { consentStatus: "REVOKED", optedOutAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true, optedOut: true });
  }

  await risteQueue.add("inbound", { type: "inbound", messageId: message.id });
  await recordInboundReply(contactId!, b.channel);
  return NextResponse.json({ ok: true, messageId: message.id });
}
