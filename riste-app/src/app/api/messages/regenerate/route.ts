import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/engine";
import { buildVoiceSystemPrompt, replyUserPrompt } from "@/lib/ai/prompt";
import { logEvent } from "@/lib/analytics";
import { loadDraftNotes } from "@/lib/notes";

/**
 * Ask the AI for a fresh draft of a pending message (keeps it awaiting approval).
 * Body: { id }. Re-drafts using the contact's tone profile + recent history.
 */
export async function POST(req: Request) {
  const { id } = await req.json();
  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });

  const contact = await prisma.contact.findUnique({
    where: { id: msg.contactId },
    include: { toneProfile: true, channels: true },
  });
  if (!contact) return NextResponse.json({ error: "no contact" }, { status: 404 });

  const recent = await prisma.message.findMany({
    where: {
      contactId: contact.id,
      OR: [{ direction: "IN" }, { status: { in: ["SENT", "DELIVERED", "READ"] } }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const history = recent.reverse();

  // A draft with no inbound conversation behind it is a greeting, not a reply —
  // re-drafting it as a "reply" would lose the greeting intent entirely.
  const isReply = history.some((m) => m.direction === "IN");
  const userPrompt = isReply
    ? replyUserPrompt(history)
    : `Rewrite this message with fresh wording — same intent, same warmth, similar length:\n"${msg.body}"`;

  const notes = await loadDraftNotes(contact.id, contact.timezone);
  const { text, escalate, confidence } = await generate(buildVoiceSystemPrompt(contact, notes), userPrompt);
  // The fresh draft becomes the new baseline, so a later edit-distance measures
  // against the AI's most recent attempt, not a discarded earlier one.
  // If the new draft escalates, hold it for a human instead of quietly queueing it.
  const updated = await prisma.message.update({
    where: { id },
    data: {
      body: text,
      originalBody: text,
      confidence,
      status: escalate ? "HELD" : "AWAITING_APPROVAL",
      heldReason: escalate ? "escalate" : null,
    },
  });
  logEvent({
    type: "regenerated",
    messageId: id,
    contactId: updated.contactId,
    channel: updated.channel,
    meta: { confidence },
  });
  return NextResponse.json(updated);
}
