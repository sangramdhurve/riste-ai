import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";

/**
 * Start (or restart) the two-week notebook pilot. Body: { action: "start" | "stop" }.
 * Results on the Metrics page count only activity after the start, so earlier
 * testing never leaks into the verdict.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b || (b.action !== "start" && b.action !== "stop")) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  const s = await getSetting();
  const updated = await prisma.setting.update({
    where: { id: s.id },
    data: { pilotStartedAt: b.action === "start" ? new Date() : null },
  });
  return NextResponse.json({ ok: true, pilotStartedAt: updated.pilotStartedAt });
}
