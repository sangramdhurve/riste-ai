import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";

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

  let contactId = b.contactId as string | undefined;
  if (!contactId && b.from) {
    const ch = await prisma.contactChannel.findFirst({
      where: { type: b.channel, value: b.from },
    });
    if (!ch) return NextResponse.json({ error: "unknown sender" }, { status: 404 });
    contactId = ch.contactId;
  }

  const message = await prisma.message.create({
    data: {
      contactId: contactId!,
      channel: b.channel,
      direction: "IN",
      body: b.body,
      status: "DELIVERED",
      externalId: b.externalId ?? null,
    },
  });

  await risteQueue.add("inbound", { type: "inbound", messageId: message.id });
  return NextResponse.json({ ok: true, messageId: message.id });
}
