import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/analytics";

/** Discard a draft so it never sends. Body: { id }. */
export async function POST(req: Request) {
  const { id } = await req.json();
  const updated = await prisma.message.update({
    where: { id },
    data: { status: "REJECTED" },
  });
  logEvent({
    type: "rejected",
    messageId: id,
    contactId: updated.contactId,
    channel: updated.channel,
  });
  return NextResponse.json(updated);
}
