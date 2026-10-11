import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";
import { jobId } from "@/lib/jobid";
import { complete } from "@/lib/ai/engine";
import { logEvent } from "@/lib/analytics";
import { localDate } from "@/lib/time";
import { dedupeProposals, extractionPrompts, parseProposals, worthScanning } from "./extract";

// Runs after everything else in the queue, and a little later, so suggesting
// notes never slows down a reply draft competing for the same model.
const SUGGEST_PRIORITY = 10;
const SUGGEST_DELAY_MS = 15_000;

/** Queue note suggestions for one message (theirs, or one sent in the user's name). */
export async function queueNoteSuggestions(messageId: string, body: string): Promise<void> {
  if (!worthScanning(body)) return;
  await risteQueue.add(
    "extractNotes",
    { type: "extractNotes", messageId },
    { jobId: jobId("extract", messageId), priority: SUGGEST_PRIORITY, delay: SUGGEST_DELAY_MS, attempts: 2 }
  );
}

/** Read a message and store up to a few PROPOSED notes for the user to review. */
export async function suggestNotesFromMessage(messageId: string): Promise<number> {
  const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { contact: true } });
  if (!msg || !worthScanning(msg.body)) return 0;
  // Only real conversation: what they sent, or what actually went out in the user's name.
  if (msg.direction === "OUT" && !["SENT", "DELIVERED", "READ"].includes(msg.status)) return 0;
  if (await prisma.note.count({ where: { sourceMessageId: msg.id } })) return 0;

  const contact = msg.contact;
  const today = localDate(contact.timezone);
  const existing = await prisma.note.findMany({
    where: { contactId: contact.id },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { text: true, sensitive: true },
  });

  const { system, user } = extractionPrompts({
    direction: msg.direction,
    name: contact.name,
    relationship: contact.relationship,
    today,
    // Private notes stay out of the prompt; duplicates are still caught below.
    known: existing.filter((n) => !n.sensitive).slice(0, 20).map((n) => n.text),
    body: msg.body,
  });
  const raw = await complete(system, user, { json: true });
  const proposals = dedupeProposals(parseProposals(raw, msg.direction, today), existing.map((n) => n.text));
  if (!proposals.length) return 0;

  await prisma.note.createMany({
    data: proposals.map((p) => ({
      ...p,
      contactId: contact.id,
      status: "PROPOSED" as const,
      source: "AI" as const,
      sourceMessageId: msg.id,
    })),
  });
  logEvent({
    type: "notes_proposed",
    contactId: contact.id,
    messageId: msg.id,
    channel: msg.channel,
    meta: { count: proposals.length, direction: msg.direction, kinds: proposals.map((p) => p.kind) },
  });
  return proposals.length;
}
