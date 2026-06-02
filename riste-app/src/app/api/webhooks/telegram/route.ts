import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendNow } from "@/lib/deliver";
import { answerCallback } from "@/lib/notify/telegram";

/**
 * Telegram webhook. When you tap Approve / Reject on a notification, Telegram
 * POSTs a callback_query here. We act on it so you can control Riste straight
 * from chat. Point your bot here once:
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<APP_URL>/api/webhooks/telegram
 */
export async function POST(req: Request) {
  // Telegram echoes this header when the webhook is registered with
  // ?secret_token=<WEBHOOK_SECRET>. Reject anything that doesn't match.
  if (
    process.env.WEBHOOK_SECRET &&
    req.headers.get("x-telegram-bot-api-secret-token") !== process.env.WEBHOOK_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update = await req.json();
  const cb = update.callback_query;
  if (!cb) return NextResponse.json({ ok: true });

  // Only accept taps from your own chat.
  const fromChat = String(cb.message?.chat?.id ?? "");
  if (process.env.TELEGRAM_CHAT_ID && fromChat !== process.env.TELEGRAM_CHAT_ID) {
    return NextResponse.json({ ok: true });
  }

  const [action, messageId] = String(cb.data ?? "").split(":");
  try {
    if (action === "approve") {
      await sendNow(messageId);
      await answerCallback(cb.id, "✅ Sent");
    } else if (action === "reject") {
      await prisma.message.update({ where: { id: messageId }, data: { status: "REJECTED" } });
      await answerCallback(cb.id, "🗑 Rejected");
    } else {
      await answerCallback(cb.id, "Unknown action");
    }
  } catch (err) {
    await answerCallback(cb.id, "⚠️ Failed");
    console.error("[telegram] action failed:", err);
  }
  return NextResponse.json({ ok: true });
}
