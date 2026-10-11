import type { ApprovalNotice, ReminderNotice } from "./index";

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

type Button = { text: string; callback_data: string };

/**
 * Telegram's HTML parse mode only needs these three escaped. (Markdown mode
 * rejected any draft or note containing a stray * or _, so the notice never
 * arrived.)
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function approvalMessage(n: ApprovalNotice): { text: string; buttons: Button[][] } {
  const tag = n.reason === "held" ? "⚠️ NEEDS YOU (escalated)" : "🕒 Approve to send";
  return {
    text:
      `${tag}\n\n` +
      `To: <b>${escapeHtml(n.contactName)}</b> (${escapeHtml(n.relationship)}) · ${escapeHtml(n.channel)}\n\n` +
      escapeHtml(n.body),
    buttons: [
      [
        { text: "✅ Approve & send", callback_data: `approve:${n.messageId}` },
        { text: "🗑 Reject", callback_data: `reject:${n.messageId}` },
      ],
    ],
  };
}

export function reminderMessage(n: ReminderNotice): { text: string; buttons: Button[][] } {
  const id = n.reminderId;
  const first: Button[] = [{ text: "✓ Done", callback_data: `rdone:${id}` }];
  if (n.canDraft) first.push({ text: "✍️ Draft a message", callback_data: `rdraft:${id}` });
  return {
    text:
      `📓 <b>${escapeHtml(n.contactName)}</b> (${escapeHtml(n.relationship)})\n\n` +
      escapeHtml(n.text) +
      (n.canDraft ? "" : "\n\n<i>Private: this one is for you to write yourself.</i>"),
    buttons: [
      first,
      [
        { text: "💤 Tomorrow", callback_data: `rsnooze:${id}:1` },
        { text: "💤 Next week", callback_data: `rsnooze:${id}:7` },
        { text: "✕ Dismiss", callback_data: `rdismiss:${id}` },
      ],
    ],
  };
}

async function send(msg: { text: string; buttons: Button[][] }) {
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  const res = await fetch(API(token, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg.text,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: msg.buttons },
    }),
  });
  if (!res.ok) throw new Error(`telegram sendMessage ${res.status}`);
}

/**
 * Sends the draft to your Telegram with inline Approve / Reject buttons.
 * Tapping a button hits our /api/webhooks/telegram route (callback_query),
 * so you can approve or kill a message without opening the dashboard.
 */
export async function notifyTelegram(n: ApprovalNotice) {
  await send(approvalMessage(n));
}

/** Sends a notebook reminder with Done / Draft / Snooze / Dismiss buttons. */
export async function notifyTelegramReminder(n: ReminderNotice) {
  await send(reminderMessage(n));
}

/** Acknowledge a button tap with a short toast in Telegram. */
export async function answerCallback(callbackId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(API(token, "answerCallbackQuery"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}
