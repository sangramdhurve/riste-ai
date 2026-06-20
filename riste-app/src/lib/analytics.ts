import { prisma } from "@/lib/db";
import type { ChannelType, Prisma } from "@prisma/client";

/**
 * Phase 1 validation instrumentation.
 *
 * Every meaningful action writes one append-only Event row so the /metrics page
 * can answer the only question that matters before we build the SaaS: are the
 * AI drafts good enough that you send them (mostly) unedited, and do they keep
 * relationships warm? Instrumentation is fire-and-forget — it must never break
 * a send.
 */
export type EventType =
  | "draft_created"
  | "approved"
  | "approved_edited"
  | "rejected"
  | "regenerated"
  | "sent"
  | "auto_sent"
  | "failed"
  | "held"
  | "reply_received";

type LogInput = {
  type: EventType;
  messageId?: string | null;
  contactId?: string | null;
  channel?: ChannelType | null;
  meta?: Prisma.InputJsonValue;
};

/** Record an analytics event. Never awaited on the hot path; never throws. */
export function logEvent(input: LogInput): void {
  prisma.event
    .create({
      data: {
        type: input.type,
        messageId: input.messageId ?? null,
        contactId: input.contactId ?? null,
        channel: input.channel ?? null,
        meta: input.meta ?? undefined,
      },
    })
    .catch((e) => console.error("[analytics] logEvent failed:", e));
}

/**
 * Levenshtein distance between two strings. Messages are short (texts), so the
 * O(n*m) cost is negligible. Used to measure how much you changed the AI's draft
 * before sending — the core authenticity signal.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * An inbound message just arrived from a contact. Mark the most recent outbound
 * we actually sent (and that hasn't been answered yet) as replied-to, so we can
 * measure reply rate — the signal that we're keeping relationships warm. Safe to
 * call from webhook/poller paths; it owns its own error handling.
 */
export async function recordInboundReply(
  contactId: string,
  channel: ChannelType
): Promise<void> {
  try {
    const lastOut = await prisma.message.findFirst({
      where: {
        contactId,
        direction: "OUT",
        status: { in: ["SENT", "DELIVERED", "READ"] },
        replyReceivedAt: null,
      },
      orderBy: { sentAt: "desc" },
    });
    if (lastOut) {
      await prisma.message.update({
        where: { id: lastOut.id },
        data: { replyReceivedAt: new Date() },
      });
    }
    logEvent({
      type: "reply_received",
      contactId,
      channel,
      messageId: lastOut?.id ?? null,
    });
  } catch (e) {
    console.error("[analytics] recordInboundReply failed:", e);
  }
}
