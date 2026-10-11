import type { NoteKind, NoteStatus, ReminderReason } from "@prisma/client";
import { daysBetween, relativeDay } from "./select";

/**
 * Pure rules for the daily reminder run: which note deserves a nudge today,
 * what the nudge says, and what to ask the AI when the user wants a draft.
 */

export type ReminderNote = {
  kind: NoteKind;
  text: string;
  eventDate: string | null;
  sensitive: boolean;
  status: NoteStatus;
  createdDate: string; // YYYY-MM-DD the note was written, in the contact's calendar
  snoozedUntil: string | null;
};

export const PROMISE_FIRST_NUDGE_DAYS = 3;
export const PROMISE_REPEAT_DAYS = 7;
export const PRIVATE_CHECKIN_DAYS = 7;
export const SNOOZE_DAYS = [1, 7] as const;

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Day 3, then every week: often enough to matter, rare enough not to nag.
function isNudgeDay(days: number): boolean {
  return days === PROMISE_FIRST_NUDGE_DAYS || (days >= PROMISE_REPEAT_DAYS && days % PROMISE_REPEAT_DAYS === 0);
}

/** The one reason (if any) this note should produce a reminder on `today`. */
export function reminderReasonForToday(n: ReminderNote, today: string): ReminderReason | null {
  if (n.status !== "ACTIVE") return null;
  if (n.snoozedUntil) {
    if (today < n.snoozedUntil) return null;
    if (today === n.snoozedUntil) return "SNOOZE_END";
  }

  if (n.kind === "EVENT" && n.eventDate) {
    const since = daysBetween(n.eventDate, today);
    if (since === 0) return "EVENT_TODAY";
    if (since === 1) return "EVENT_AFTER";
    if (since === PRIVATE_CHECKIN_DAYS && n.sensitive) return "EVENT_CHECKIN";
    return null;
  }

  if (n.kind === "PROMISE") {
    if (n.eventDate) {
      const late = daysBetween(n.eventDate, today);
      if (late === 0) return "PROMISE_DUE";
      return late > 0 && isNudgeDay(late) ? "PROMISE_OPEN" : null;
    }
    return isNudgeDay(daysBetween(n.createdDate, today)) ? "PROMISE_OPEN" : null;
  }

  return null;
}

function promiseAge(n: ReminderNote, today: string): string {
  if (n.eventDate) {
    const late = daysBetween(n.eventDate, today);
    return late > 0 ? `${late} days overdue` : `due ${relativeDay(n.eventDate, today)}`;
  }
  return `promised ${daysBetween(n.createdDate, today)} days ago`;
}

/** The reminder line shown on the dashboard and sent to Telegram. */
export function reminderText(reason: ReminderReason, n: ReminderNote, name: string, today: string): string {
  switch (reason) {
    case "EVENT_TODAY":
      return n.sensitive ? `Today: ${n.text}. Check in on ${name}.` : `Today: ${n.text}. Send ${name} a quick message?`;
    case "EVENT_AFTER":
      return n.sensitive ? `Yesterday: ${n.text}. Ask ${name} how things are.` : `Yesterday: ${n.text}. Ask ${name} how it went.`;
    case "EVENT_CHECKIN":
      return `It's been a week since: ${n.text}. Check in on ${name}.`;
    case "PROMISE_DUE":
      return `You promised ${name}: ${n.text}. Due today.`;
    case "PROMISE_OPEN":
      return `You promised ${name}: ${n.text}. Still open (${promiseAge(n, today)}).`;
    case "SNOOZE_END":
      if (n.kind === "PROMISE") return `You promised ${name}: ${n.text}. Still open (${promiseAge(n, today)}).`;
      if (n.eventDate) return `${n.text} (${relativeDay(n.eventDate, today)}). Check in with ${name}?`;
      return `About ${name}: ${n.text}`;
  }
}

/**
 * What to ask the AI for when the user taps "Draft a message" on a reminder.
 * Private notes never become drafts: those moments are for the user to write.
 */
export function reminderDraftPrompt(reason: ReminderReason, n: ReminderNote, today: string): string | null {
  if (n.sensitive) return null;
  const event = (what: string) => `${what} It is THEIR event, not yours.`;
  const promise = `Write a short, honest message following up on something you promised them: "${n.text}". Do not claim it is already done.`;

  switch (reason) {
    case "EVENT_TODAY":
      return event(`Write a short, warm message about this, which is happening for them today: "${n.text}".`);
    case "EVENT_AFTER":
      return event(`Write a short message asking how this went for them: "${n.text}" (yesterday).`);
    case "PROMISE_DUE":
    case "PROMISE_OPEN":
      return promise;
    case "SNOOZE_END":
      if (n.kind === "PROMISE") return promise;
      if (n.eventDate) {
        const past = daysBetween(n.eventDate, today) > 0;
        return event(
          past
            ? `Write a short message asking how this went for them: "${n.text}" (${relativeDay(n.eventDate, today)}).`
            : `Write a short, warm message about this, coming up for them ${relativeDay(n.eventDate, today)}: "${n.text}".`
        );
      }
      return null;
    case "EVENT_CHECKIN":
      return null;
  }
}
