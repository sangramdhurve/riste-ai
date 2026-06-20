import { prisma } from "@/lib/db";
import type { ChannelType, Direction } from "@prisma/client";

/**
 * Append an immutable audit record of a message actually sent or received.
 * Fire-and-forget — auditing must never break a send. This is the clean trail
 * for consent/abuse investigations, separate from the mutable Message table.
 */
export function recordAudit(args: {
  contactId: string;
  channel: ChannelType;
  direction: Direction;
  body: string;
  externalId?: string | null;
  aiGenerated?: boolean;
}): void {
  prisma.auditLog
    .create({
      data: {
        contactId: args.contactId,
        channel: args.channel,
        direction: args.direction,
        body: args.body,
        externalId: args.externalId ?? null,
        aiGenerated: args.aiGenerated ?? false,
      },
    })
    .catch((e) => console.error("[audit] recordAudit failed:", e));
}
