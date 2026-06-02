import { notifyTelegram } from "./telegram";

export type ApprovalNotice = {
  messageId: string;
  contactName: string;
  relationship: string;
  channel: string;
  body: string;
  reason: "awaiting_approval" | "held";
};

/**
 * Fan out a "needs you" notice to every enabled channel. Dashboard is always
 * implicit (the message is already in the queue). Telegram is built. WhatsApp-
 * to-self is a planned adapter that plugs in here later.
 */
export async function notifyOperator(notice: ApprovalNotice) {
  const jobs: Promise<unknown>[] = [];
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    jobs.push(notifyTelegram(notice).catch((e) => console.error("[notify] telegram failed:", e)));
  }
  // TODO Phase 4: notifyWhatsappSelf(notice)
  await Promise.all(jobs);
}
