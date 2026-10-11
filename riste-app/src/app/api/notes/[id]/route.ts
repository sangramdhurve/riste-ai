import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseNoteInput } from "@/lib/notes/validate";
import { logEvent } from "@/lib/analytics";

type Params = { params: { id: string } };

/** Edit a note or mark it done/active. Body: any of { text, kind, eventDate, sensitive, status }. */
export async function PATCH(req: Request, { params }: Params) {
  const parsed = parseNoteInput(await req.json().catch(() => null), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data } = parsed;
  const before = await prisma.note.findUnique({ where: { id: params.id } });
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

  const doneAt = data.status === "DONE" ? new Date() : data.status === "ACTIVE" ? null : undefined;
  const note = await prisma.note.update({ where: { id: params.id }, data: { ...data, doneAt } });

  // Reviewing an AI suggestion: record keep/dismiss (and whether it was edited)
  // for the pilot's "you keep most suggestions" measure.
  if (before.status === "PROPOSED" && (note.status === "ACTIVE" || note.status === "DISMISSED")) {
    const edited =
      note.text !== before.text ||
      note.kind !== before.kind ||
      note.eventDate !== before.eventDate ||
      note.sensitive !== before.sensitive;
    logEvent({
      type: note.status === "ACTIVE" ? "note_kept" : "note_dismissed",
      contactId: note.contactId,
      messageId: note.sourceMessageId,
      meta: { noteId: note.id, kind: note.kind, edited },
    });
  }
  return NextResponse.json(note);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { count } = await prisma.note.deleteMany({ where: { id: params.id } });
  if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
