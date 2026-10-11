import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { parseSettingsInput } from "@/lib/settings-input";

/** Update global settings. Body: any subset of the fields on the Settings page. */
export async function PATCH(req: Request) {
  const current = await getSetting();
  const parsed = parseSettingsInput(await req.json().catch(() => null), current);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await prisma.setting.update({ where: { id: current.id }, data: parsed.data });
  if (parsed.data.killSwitch !== undefined && parsed.data.killSwitch !== current.killSwitch) {
    console.log(`[settings] sending ${updated.killSwitch ? "PAUSED" : "resumed"}`);
  }
  return NextResponse.json({ ok: true });
}
