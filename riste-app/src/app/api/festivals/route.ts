import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** List upcoming festivals (today onward). */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const festivals = await prisma.festival.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
    take: 60,
  });
  return NextResponse.json(festivals);
}

/** Manually add a festival / personal date. Body: { name, date (YYYY-MM-DD), tags? }. */
export async function POST(req: Request) {
  const b = await req.json();
  if (!b.name || !b.date) {
    return NextResponse.json({ error: "need name and date" }, { status: 400 });
  }
  const festival = await prisma.festival.upsert({
    where: { date_name: { date: b.date, name: b.name } },
    update: { tags: (b.tags ?? []).map((t: string) => t.toLowerCase()) },
    create: {
      name: b.name,
      date: b.date,
      tags: (b.tags ?? []).map((t: string) => t.toLowerCase()),
      source: "manual",
    },
  });
  return NextResponse.json(festival, { status: 201 });
}
