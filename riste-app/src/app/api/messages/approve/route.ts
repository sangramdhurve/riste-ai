import { NextResponse } from "next/server";
import { sendNow } from "@/lib/deliver";
import { prisma } from "@/lib/db";
import { logEvent, editDistance } from "@/lib/analytics";

/**
 * Operator approves (and optionally edits) a draft, then it sends now.
 * Body: { id, body? }  — body overrides the AI draft if you edited it.
 */
export async function POST(req: Request) {
  const { id, body } = await req.json();
  try {
    // Snapshot the AI draft BEFORE sendNow overwrites body, so we can measure
    // how much you changed it (the verbatim-send / authenticity signal).
    const before = await prisma.message.findUnique({ where: { id } });
    const updated = await sendNow(id, body, { manual: true });

    // A guardrail (e.g. missing consent) can block even a manual approval. Don't
    // count it as an approval — surface the reason so the UI can explain it.
    if (updated.status !== "SENT") {
      return NextResponse.json(
        { error: "blocked", reason: updated.heldReason ?? "blocked", status: updated.status },
        { status: 409 }
      );
    }

    if (before) {
      const original = before.originalBody ?? before.body;
      const finalBody = body ?? before.body;
      const dist = editDistance(original, finalBody);
      if (dist > 0) {
        await prisma.message.update({ where: { id }, data: { editDistance: dist } }).catch(() => {});
      }
      logEvent({
        type: dist > 0 ? "approved_edited" : "approved",
        messageId: id,
        contactId: before.contactId,
        channel: before.channel,
        meta: { editDistance: dist },
      });
    }
    return NextResponse.json(updated);
  } catch (err) {
    // Provider errors can name the mail/SMS service or echo credentials; keep
    // them in the server log and give the dashboard a plain answer.
    console.error("[approve] send failed:", err);
    const msg = String(err);
    if (msg.includes("message not found")) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (msg.includes("message was rejected")) return NextResponse.json({ error: "rejected" }, { status: 409 });
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
