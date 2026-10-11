import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseNoteInput } from "@/lib/notes/validate";

type Params = { params: { id: string } };

/** Edit a note or mark it done/active. Body: any of { text, kind, eventDate, sensitive, status }. */
export async function PATCH(req: Request, { params }: Params) {
  const parsed = parseNoteInput(await req.json().catch(() => null), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data } = parsed;
  const doneAt = data.status === "DONE" ? new Date() : data.status === "ACTIVE" ? null : undefined;
  try {
    const note = await prisma.note.update({ where: { id: params.id }, data: { ...data, doneAt } });
    return NextResponse.json(note);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { count } = await prisma.note.deleteMany({ where: { id: params.id } });
  if (!count) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
