import type { NoteKind, NoteStatus } from "@prisma/client";

/**
 * Pure rules for which notebook notes the AI may see when drafting. Kept free of
 * database access so they can be unit-tested and imported by client code.
 */

export type NoteLike = {
  kind: NoteKind;
  text: string;
  eventDate: string | null;
  sensitive: boolean;
  status: NoteStatus;
  createdAt: Date;
};

// `soon` = events today or tomorrow: the moments a greeting should not miss.
export type DraftNotes = { about: string[]; promises: string[]; soon: string[] };

export const MAX_FACTS = 8;
export const MAX_EVENTS = 5;
export const MAX_PROMISES = 5;
// An event is worth mentioning from a week before it until two weeks after.
export const EVENT_LOOKAHEAD_DAYS = 7;
export const EVENT_LOOKBACK_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole calendar days from `today` to `date` (both YYYY-MM-DD). Negative = past. */
export function daysBetween(today: string, date: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${date}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function relativeDay(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/**
 * Pick the notes a draft may use: ACTIVE and not sensitive, events only near
 * their date, newest facts first, everything capped so the prompt stays small.
 */
export function selectDraftNotes(notes: NoteLike[], today: string): DraftNotes {
  const usable = notes
    .filter((n) => n.status === "ACTIVE" && !n.sensitive)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const nearby = usable
    .filter((n) => n.kind === "EVENT" && n.eventDate)
    .map((n) => ({ n, d: daysBetween(today, n.eventDate!) }))
    .filter(({ d }) => d <= EVENT_LOOKAHEAD_DAYS && d >= -EVENT_LOOKBACK_DAYS)
    .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))
    .slice(0, MAX_EVENTS);
  const label = (n: NoteLike) => `${n.text} (${relativeDay(n.eventDate!, today)})`;
  const events = nearby.map(({ n }) => label(n));
  const soon = nearby.filter(({ d }) => d === 0 || d === 1).map(({ n }) => label(n));

  // An event with no date can't be placed in time, so treat it like a fact.
  const facts = usable
    .filter((n) => n.kind === "FACT" || (n.kind === "EVENT" && !n.eventDate))
    .slice(0, MAX_FACTS)
    .map((n) => n.text);

  const promises = usable
    .filter((n) => n.kind === "PROMISE")
    .slice(0, MAX_PROMISES)
    .map((n) => (n.eventDate ? `${n.text} (due ${relativeDay(n.eventDate, today)})` : n.text));

  return { about: [...events, ...facts], promises, soon };
}
