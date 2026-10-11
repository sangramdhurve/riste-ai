import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseNoteInput } from "@/lib/notes/validate";

type Params = { params: { id: string } };

/** List a contact's notebook (active first, then done). */
export async function GET(_req: Request, { params }: Params) {
  const notes = await prisma.note.findMany({
    where: { contactId: params.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(notes);
}

/**
 * Add a note. Body: { text, kind?, eventDate?, sensitive? }.
 * If `sensitive` is omitted it is decided by the personal-topic keyword check.
 */
export async function POST(req: Request, { params }: Params) {
  const parsed = parseNoteInput(await req.json().catch(() => null), false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Notes added by hand are always active; status changes go through PATCH.
  const { status: _ignored, ...fields } = parsed.data;
  const note = await prisma.note.create({
    data: { ...fields, text: fields.text!, contactId: contact.id },
  });
  return NextResponse.json(note, { status: 201 });
}

/** "Forget everything about this person": delete every note for the contact. */
export async function DELETE(_req: Request, { params }: Params) {
  const { count } = await prisma.note.deleteMany({ where: { contactId: params.id } });
  return NextResponse.json({ ok: true, deleted: count });
}
