import type { ApprovalNotice } from "./index";

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

/**
 * Sends the draft to your Telegram with inline Approve / Reject buttons.
 * Tapping a button hits our /api/webhooks/telegram route (callback_query),
 * so you can approve or kill a message without opening the dashboard.
 */
export async function notifyTelegram(n: ApprovalNotice) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const tag = n.reason === "held" ? "⚠️ NEEDS YOU (escalated)" : "🕒 Approve to send";

  const text =
    `${tag}\n\n` +
    `To: *${n.contactName}* (${n.relationship}) · ${n.channel}\n\n` +
    `${n.body}`;

  await fetch(API(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve & send", callback_data: `approve:${n.messageId}` },
            { text: "🗑 Reject", callback_data: `reject:${n.messageId}` },
          ],
        ],
      },
    }),
  });
}

/** Acknowledge a button tap and update the Telegram message text. */
export async function answerCallback(callbackId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  await fetch(API(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}
