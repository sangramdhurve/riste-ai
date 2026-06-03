import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: { id: string } };

/** Update a contact's quick settings. Body: { active?, autonomy?, morningTime?, eveningTime? }. */
export async function PATCH(req: Request, { params }: Params) {
  const b = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof b.active === "boolean") data.active = b.active;
  if (b.autonomy) data.autonomy = b.autonomy;
  if (b.morningTime !== undefined) data.morningTime = b.morningTime || null;
  if (b.eveningTime !== undefined) data.eveningTime = b.eveningTime || null;

  const updated = await prisma.contact.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

/** Delete a contact (cascades channels, tone profile, and messages). */
export async function DELETE(_req: Request, { params }: Params) {
  await prisma.contact.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
