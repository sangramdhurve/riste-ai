import { NextResponse } from "next/server";
import { refreshFestivals } from "@/lib/festivals/calendarific";

/** Load a year of festival dates. Body: { year? } (defaults to current). */
export async function POST(req: Request) {
  const { year } = await req.json().catch(() => ({}));
  const y = Number(year) || new Date().getFullYear();
  if (!process.env.CALENDARIFIC_API_KEY) return NextResponse.json({ error: "not_set_up" }, { status: 400 });
  try {
    const count = await refreshFestivals(y);
    return NextResponse.json({ ok: true, year: y, imported: count });
  } catch (err) {
    // The provider's error text names the service; keep it in the server log.
    console.error("[festivals] refresh failed:", err);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
