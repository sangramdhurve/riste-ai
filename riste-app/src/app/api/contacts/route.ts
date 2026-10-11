import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

export async function GET() {
  const contacts = await prisma.contact.findMany({
    include: { channels: true, toneProfile: true, _count: { select: { messages: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(contacts);
}

export async function POST(req: Request) {
  const b = await req.json();
  const { defaultAutonomy } = await getSetting();
  const contact = await prisma.contact.create({
    data: {
      name: b.name,
      relationship: b.relationship,
      timezone: b.timezone ?? "Asia/Kolkata",
      language: b.language ?? "en",
      autonomy: b.autonomy ?? defaultAutonomy,
      morningTime: b.morningTime ?? null,
      eveningTime: b.eveningTime ?? null,
      festivals: b.festivals ?? [],
      channels: {
        create: (b.channels ?? []).map((c: any, i: number) => ({
          type: c.type,
          value: c.value,
          isPrimary: c.isPrimary ?? i === 0,
        })),
      },
      toneProfile: {
        create: {
          sampleMessages: b.sampleMessages ?? [],
          styleNotes: b.styleNotes ?? "",
          languageMix: b.languageMix ?? "",
          doNotSay: b.doNotSay ?? [],
        },
      },
    },
    include: { channels: true, toneProfile: true },
  });
  return NextResponse.json(contact, { status: 201 });
}
