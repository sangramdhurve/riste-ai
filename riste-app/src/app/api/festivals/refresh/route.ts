import { NextResponse } from "next/server";
import { refreshFestivals } from "@/lib/festivals/calendarific";

/** Pull a year of holidays from Calendarific. Body: { year? } (defaults to current). */
export async function POST(req: Request) {
  const { year } = await req.json().catch(() => ({}));
  const y = Number(year) || new Date().getFullYear();
  try {
    const count = await refreshFestivals(y);
    return NextResponse.json({ ok: true, year: y, imported: count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
