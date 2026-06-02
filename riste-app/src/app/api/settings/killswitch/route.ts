import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Toggle the global kill switch. When ON, the worker sends nothing. */
export async function POST(req: Request) {
  const { on } = await req.json();
  const existing = (await prisma.setting.findFirst()) ?? (await prisma.setting.create({ data: { id: 1 } }));
  const updated = await prisma.setting.update({
    where: { id: existing.id },
    data: { killSwitch: Boolean(on) },
  });
  return NextResponse.json(updated);
}
