import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";
import { logEvent } from "@/lib/analytics";
import { notifyReminder } from "@/lib/notify";
import { localDate } from "@/lib/time";
import { addDays, reminderReasonForToday, reminderText, SNOOZE_DAYS, type ReminderNote } from "@/lib/notes/reminders";

/**
 * IO side of the daily reminders: create today's reminders for a contact and
 * apply the user's choice (done / snooze / dismiss / draft). Both the dashboard
 * and the Telegram buttons go through actOnReminder so they behave the same.
 */

export function toReminderNote(
  n: { kind: ReminderNote["kind"]; text: string; eventDate: string | null; sensitive: boolean; status: ReminderNote["status"]; createdAt: Date; snoozedUntil: string | null },
  timezone: string
): ReminderNote {
  return { ...n, createdDate: localDate(timezone, n.createdAt) };
}

/** Create (and push) today's reminders for one contact. Safe to run repeatedly. */
export async function runDailyReminders(contactId: string): Promise<number> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { notes: { where: { status: "ACTIVE", kind: { in: ["EVENT", "PROMISE"] } } } },
  });
  if (!contact) return 0;
  const today = localDate(contact.timezone);

  let created = 0;
  for (const n of contact.notes) {
    const rn = toReminderNote(n, contact.timezone);
    const reason = reminderReasonForToday(rn, today);
    if (!reason) continue;

    let reminder;
    try {
      reminder = await prisma.reminder.create({
        data: {
          noteId: n.id,
          contactId: contact.id,
          dueDate: today,
          reason,
          text: reminderText(reason, rn, contact.name, today),
        },
      });
    } catch (e) {
      // Already reminded about this note today (unique noteId+dueDate).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
    created++;
    logEvent({ type: "reminder_created", contactId: contact.id, meta: { reminderId: reminder.id, reason, kind: n.kind } });

    const pushed = await notifyReminder({
      reminderId: reminder.id,
      contactName: contact.name,
      relationship: contact.relationship,
      text: reminder.text,
      canDraft: !n.sensitive,
    });
    if (pushed) await prisma.reminder.update({ where: { id: reminder.id }, data: { notifiedAt: new Date() } });
  }
  return created;
}

export type ReminderAction = "done" | "snooze" | "dismiss" | "draft";
export type ActResult = { ok: true; message: string } | { ok: false; error: string; status: number };

/** Apply the user's choice to an open reminder. */
export async function actOnReminder(id: string, action: ReminderAction, days?: number): Promise<ActResult> {
  const r = await prisma.reminder.findUnique({ where: { id }, include: { note: true, contact: true } });
  if (!r) return { ok: false, error: "not found", status: 404 };
  if (r.status !== "OPEN") return { ok: false, error: "already handled", status: 409 };
  const acted = { actedAt: new Date() };
  const base = { contactId: r.contactId, meta: { reminderId: r.id, reason: r.reason } };

  switch (action) {
    case "done": {
      await prisma.reminder.update({ where: { id }, data: { status: "DONE", ...acted } });
      // Acting on a promise reminder means the promise is kept.
      if (r.note.kind === "PROMISE") {
        await prisma.note.update({ where: { id: r.noteId }, data: { status: "DONE", doneAt: new Date() } });
      }
      logEvent({ type: "reminder_done", ...base });
      return { ok: true, message: r.note.kind === "PROMISE" ? "Promise marked done" : "Marked done" };
    }
    case "snooze": {
      if (!SNOOZE_DAYS.includes(days as (typeof SNOOZE_DAYS)[number])) {
        return { ok: false, error: "invalid snooze", status: 400 };
      }
      const until = addDays(localDate(r.contact.timezone), days!);
      await prisma.note.update({ where: { id: r.noteId }, data: { snoozedUntil: until } });
      await prisma.reminder.update({ where: { id }, data: { status: "SNOOZED", ...acted } });
      logEvent({ type: "reminder_snoozed", ...base, meta: { ...base.meta, days } });
      return { ok: true, message: days === 1 ? "Snoozed until tomorrow" : "Snoozed for a week" };
    }
    case "dismiss": {
      await prisma.reminder.update({ where: { id }, data: { status: "DISMISSED", ...acted } });
      logEvent({ type: "reminder_dismissed", ...base });
      return { ok: true, message: "Dismissed" };
    }
    case "draft": {
      if (r.note.sensitive) return { ok: false, error: "private notes are for you to write", status: 400 };
      await prisma.reminder.update({ where: { id }, data: { status: "DRAFTED", ...acted } });
      await risteQueue.add("reminderDraft", { type: "reminderDraft", reminderId: id }, { attempts: 2 });
      logEvent({ type: "reminder_drafted", ...base });
      return { ok: true, message: "Drafting… it will appear under Needs your attention" };
    }
  }
}
