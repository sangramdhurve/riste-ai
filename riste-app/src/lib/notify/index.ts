import { notifyTelegram, notifyTelegramReminder } from "./telegram";

export type ApprovalNotice = {
  messageId: string;
  contactName: string;
  relationship: string;
  channel: string;
  body: string;
  reason: "awaiting_approval" | "held";
};

export type ReminderNotice = {
  reminderId: string;
  contactName: string;
  relationship: string;
  text: string;
  canDraft: boolean; // false for private notes: no "Draft a message" button
};

const telegramEnabled = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

/**
 * Fan out a "needs you" notice to every enabled channel. Dashboard is always
 * implicit (the message is already in the queue). Telegram is built. WhatsApp-
 * to-self is a planned adapter that plugs in here later.
 */
export async function notifyOperator(notice: ApprovalNotice) {
  const jobs: Promise<unknown>[] = [];
  if (telegramEnabled()) {
    jobs.push(notifyTelegram(notice).catch((e) => console.error("[notify] telegram failed:", e)));
  }
  // TODO Phase 4: notifyWhatsappSelf(notice)
  await Promise.all(jobs);
}

/** Notebook reminder. Returns true if it reached at least one push channel. */
export async function notifyReminder(notice: ReminderNotice): Promise<boolean> {
  if (!telegramEnabled()) return false;
  try {
    await notifyTelegramReminder(notice);
    return true;
  } catch (e) {
    console.error("[notify] telegram reminder failed:", e);
    return false;
  }
}
