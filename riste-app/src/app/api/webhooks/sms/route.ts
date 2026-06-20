import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";
import { recordInboundReply } from "@/lib/analytics";
import { isOptOut } from "@/lib/optout";
import { recordAudit } from "@/lib/audit";

/**
 * Inbound SMS from the android-sms-gateway "sms:received" webhook.
 * Configure the gateway to POST here with ?secret=<WEBHOOK_SECRET>.
 * Payload shapes vary by version, so we read defensively.
 */
const digits = (s: string) => s.replace(/\D/g, "");

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const b = await req.json();
  const p = b.payload ?? b;
  const phone: string | undefined = p.phoneNumber ?? p.from ?? p.sender;
  const text: string | undefined = p.message ?? p.text ?? p.body;
  const externalId: string | undefined = p.messageId ?? p.id;
  if (!phone || !text) {
    return NextResponse.json({ error: "missing phone/message" }, { status: 400 });
  }

  // Idempotency: skip if the gateway already delivered this message id.
  if (externalId) {
    const seen = await prisma.message.findFirst({ where: { externalId } });
    if (seen) return NextResponse.json({ ok: true, duplicate: true });
  }

  // Match by last 10 digits so +91XXXXXXXXXX, 0XXXXXXXXXX, etc. all resolve.
  const want = digits(phone).slice(-10);
  const smsChannels = await prisma.contactChannel.findMany({ where: { type: "SMS" } });
  const match = smsChannels.find((c) => digits(c.value).slice(-10) === want);
  if (!match) return NextResponse.json({ error: "unknown sender" }, { status: 404 });

  const cleanText = text.trim();
  const msg = await prisma.message.create({
    data: {
      contactId: match.contactId,
      channel: "SMS",
      direction: "IN",
      body: cleanText,
      status: "DELIVERED",
      externalId: externalId ?? null,
    },
  });
  recordAudit({ contactId: match.contactId, channel: "SMS", direction: "IN", body: cleanText, externalId });

  // Honour opt-out: flip consent and do NOT draft a reply.
  if (isOptOut(cleanText)) {
    await prisma.contactChannel.update({
      where: { id: match.id },
      data: { consentStatus: "REVOKED", optedOutAt: new Date() },
    });
    return NextResponse.json({ ok: true, optedOut: true });
  }

  await risteQueue.add("inbound", { type: "inbound", messageId: msg.id });
  await recordInboundReply(match.contactId, "SMS");
  return NextResponse.json({ ok: true, messageId: msg.id });
}
