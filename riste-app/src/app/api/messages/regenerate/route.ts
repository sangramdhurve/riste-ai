import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/engine";
import { buildVoiceSystemPrompt, replyUserPrompt } from "@/lib/ai/prompt";

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

  const history = await prisma.message.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "asc" },
  });

  const { text, confidence } = await generate(buildVoiceSystemPrompt(contact), replyUserPrompt(history));
  const updated = await prisma.message.update({
    where: { id },
    data: { body: text, confidence, status: "AWAITING_APPROVAL" },
  });
  return NextResponse.json(updated);
}
