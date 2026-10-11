import { NextResponse } from "next/server";
import { actOnReminder, type ReminderAction } from "@/lib/reminders";

const ACTIONS: ReminderAction[] = ["done", "snooze", "dismiss", "draft"];

/** Act on a reminder. Body: { action: "done" | "snooze" | "dismiss" | "draft", days?: 1 | 7 }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json().catch(() => null);
  if (!b || !ACTIONS.includes(b.action)) return NextResponse.json({ error: "invalid action" }, { status: 400 });

  const result = await actOnReminder(params.id, b.action, b.days);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, message: result.message });
}
