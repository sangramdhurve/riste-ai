import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { ConsentStatus } from "@prisma/client";

/**
 * Record consent for a contact channel. Body: { channelId, status, source? }.
 * GRANTED unlocks sending; REVOKED is a permanent opt-out (sets optedOutAt).
 */
export async function POST(req: Request) {
  const { channelId, status, source } = await req.json();
  if (!channelId || !status) {
    return NextResponse.json({ error: "channelId and status required" }, { status: 400 });
  }
  const valid: ConsentStatus[] = ["UNKNOWN", "PENDING", "GRANTED", "REVOKED"];
  if (!valid.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const updated = await prisma.contactChannel.update({
    where: { id: channelId },
    data: {
      consentStatus: status,
      consentSource: source ?? undefined,
      consentAt: status === "GRANTED" ? new Date() : undefined,
      optedOutAt: status === "REVOKED" ? new Date() : null,
    },
  });
  return NextResponse.json(updated);
}
