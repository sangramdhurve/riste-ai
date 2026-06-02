import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * GET = Meta's webhook verification handshake (echo hub.challenge).
 * Configure the webhook in the Meta app with this URL and WHATSAPP_VERIFY_TOKEN.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

/**
 * POST = incoming messages and delivery/read status updates.
 * - messages: resolve sender to a contact (last 10 digits), store + enqueue reply.
 * - statuses: update the matching outbound message (matched by wamid externalId).
 */
export async function POST(req: Request) {
  const body = await req.json();
  try {
    const changes = body.entry?.flatMap((e: any) => e.changes ?? []) ?? [];
    for (const ch of changes) {
      const value = ch.value ?? {};

      for (const m of value.messages ?? []) {
        const from: string | undefined = m.from;
        const text: string | undefined = m.text?.body;
        if (!from || !text) continue;

        const want = digits(from).slice(-10);
        const waChannels = await prisma.contactChannel.findMany({ where: { type: "WHATSAPP" } });
        const match = waChannels.find((c) => digits(c.value).slice(-10) === want);
        if (!match) continue;

        const msg = await prisma.message.create({
          data: {
            contactId: match.contactId,
            channel: "WHATSAPP",
            direction: "IN",
            body: text.trim(),
            status: "DELIVERED",
            externalId: m.id ?? null,
          },
        });
        await risteQueue.add("inbound", { type: "inbound", messageId: msg.id });
      }

      for (const s of value.statuses ?? []) {
        if (!s.id) continue;
        const newStatus =
          s.status === "read" ? "READ" : s.status === "delivered" ? "DELIVERED" : null;
        if (!newStatus) continue;
        await prisma.message.updateMany({
          where: { externalId: s.id },
          data: { status: newStatus },
        });
      }
    }
  } catch (err) {
    console.error("[whatsapp] webhook error:", err);
  }
  // Always 200 so Meta doesn't retry-storm.
  return NextResponse.json({ ok: true });
}
