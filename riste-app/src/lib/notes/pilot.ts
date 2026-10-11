import type { ReminderStatus } from "@prisma/client";
import { isDuplicate } from "./extract";

/**
 * Pure scoring for the notebook pilot (Phase 5, step 4). The targets are the
 * success criteria written down before the pilot started (architecture doc §9),
 * so they are constants here, not knobs to tune after seeing the results.
 */
export const PILOT_DAYS = 14;
export const KEEP_TARGET = 0.7; // you keep ≥70% of the notes Riste suggests
export const ACT_TARGET = 0.5; // ≥50% of reminders end with you acting on them
export const REMINDER_SENDS_TARGET = 3; // ≥3 messages that went out because of a reminder
export const MIN_SUGGESTION_DECISIONS = 10; // below these the sample is too small to judge
export const MIN_REMINDER_OUTCOMES = 10;
export const REMINDER_IGNORED_AFTER_DAYS = 7; // an open reminder this old counts as ignored

export type ReminderOutcome = "acted" | "dismissed" | "ignored" | "snoozed" | "pending";

export function reminderOutcome(status: ReminderStatus, createdAt: Date, now: Date): ReminderOutcome {
  if (status === "DONE" || status === "DRAFTED") return "acted";
  if (status === "DISMISSED") return "dismissed";
  // A snooze defers the decision; the reminder it brings back is what counts.
  if (status === "SNOOZED") return "snoozed";
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  return ageDays >= REMINDER_IGNORED_AFTER_DAYS ? "ignored" : "pending";
}

/** Does this message talk about one of the contact's private notes? */
export function mentionsPrivateNote(body: string, privateNotes: string[]): boolean {
  return privateNotes.some((note) => isDuplicate(note, [body]));
}

export type PilotInput = {
  kept: number;
  dismissed: number;
  pendingSuggestions: number;
  reminderOutcomes: ReminderOutcome[];
  reminderSends: number; // messages drafted from a reminder that actually went out
  reminderSendsReplied: number;
  privateMentionsInAutoSent: number;
  startedAt: Date | null; // when the user pressed Start
  now: Date;
};

export type Verdict = { cls: "wait" | "go" | "no"; title: string; body: string };

export type PilotSummary = {
  keepRate: number | null;
  actRate: number | null;
  counts: Record<ReminderOutcome, number>;
  suggestionDecisions: number;
  reminderDecided: number;
  day: number | null;
  keepGo: boolean;
  actGo: boolean;
  sendsGo: boolean;
  safeGo: boolean;
  verdict: Verdict;
};

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

export function pilotSummary(i: PilotInput): PilotSummary {
  const counts: Record<ReminderOutcome, number> = { acted: 0, dismissed: 0, ignored: 0, snoozed: 0, pending: 0 };
  for (const o of i.reminderOutcomes) counts[o]++;

  const suggestionDecisions = i.kept + i.dismissed;
  const reminderDecided = counts.acted + counts.dismissed + counts.ignored;
  const keepRate = ratio(i.kept, suggestionDecisions);
  const actRate = ratio(counts.acted, reminderDecided);
  const day = i.startedAt ? Math.floor((i.now.getTime() - i.startedAt.getTime()) / 86_400_000) + 1 : null;

  const keepGo = keepRate !== null && keepRate >= KEEP_TARGET;
  const actGo = actRate !== null && actRate >= ACT_TARGET;
  const sendsGo = i.reminderSends >= REMINDER_SENDS_TARGET;
  const safeGo = i.privateMentionsInAutoSent === 0;

  const finished = day !== null && day > PILOT_DAYS;
  const dayLabel = day ? `day ${Math.min(day, PILOT_DAYS)} of ${PILOT_DAYS}` : "";
  const gaps = [
    !keepGo && "suggestions are mostly not worth keeping (tune what Riste picks out)",
    !actGo && "most reminders are dismissed or ignored (fewer, better-timed reminders)",
    !sendsGo && `fewer than ${REMINDER_SENDS_TARGET} reminders turned into a message`,
  ].filter(Boolean);

  let verdict: Verdict;
  if (!safeGo) {
    verdict = {
      cls: "no",
      title: "⚠️ Safety check failed",
      body: `${i.privateMentionsInAutoSent} message${i.privateMentionsInAutoSent === 1 ? "" : "s"} sent without your approval mentioned a private topic. Switch those contacts back to supervised and look at what went out before continuing.`,
    };
  } else if (!i.startedAt) {
    verdict = {
      cls: "wait",
      title: "⏳ Pilot not started",
      body: "Set up 2–3 real contacts and get the checks below green, then press Start. Only what happens after that counts.",
    };
  } else if (suggestionDecisions < MIN_SUGGESTION_DECISIONS || reminderDecided < MIN_REMINDER_OUTCOMES) {
    verdict = {
      cls: "wait",
      title: `⏳ Pilot running: ${dayLabel}`,
      body: `Keep using it. The verdict needs ${MIN_SUGGESTION_DECISIONS} suggestion decisions (so far ${suggestionDecisions}) and ${MIN_REMINDER_OUTCOMES} handled reminders (so far ${reminderDecided}).`,
    };
  } else if (!gaps.length) {
    verdict = finished
      ? { cls: "go", title: "✅ The notebook works", body: "You keep most of what Riste remembers, act on most reminders, and reminders are turning into real conversations." }
      : { cls: "go", title: `✅ On track: ${dayLabel}`, body: "Every target is met so far. Keep going until the two weeks are up." };
  } else {
    verdict = finished
      ? { cls: "no", title: "⚠️ Not yet", body: `What's falling short: ${gaps.join("; ")}.` }
      : { cls: "wait", title: `⏳ Pilot running: ${dayLabel}`, body: `Enough data to see a trend. Currently short on: ${gaps.join("; ")}.` };
  }

  return { keepRate, actRate, counts, suggestionDecisions, reminderDecided, day, keepGo, actGo, sendsGo, safeGo, verdict };
}

