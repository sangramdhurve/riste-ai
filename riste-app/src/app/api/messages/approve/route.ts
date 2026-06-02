import { NextResponse } from "next/server";
import { sendNow } from "@/lib/deliver";

/**
 * Operator approves (and optionally edits) a draft, then it sends now.
 * Body: { id, body? }  — body overrides the AI draft if you edited it.
 */
export async function POST(req: Request) {
  const { id, body } = await req.json();
  try {
    const updated = await sendNow(id, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
