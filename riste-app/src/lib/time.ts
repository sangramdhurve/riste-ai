/**
 * Timezone helpers shared by the scheduler and the send-guardrails. Kept pure
 * (an explicit `now` makes them testable) so quiet-hours logic can be unit-tested.
 */

/** HH:MM (24h) in the given timezone. */
export function localHHMM(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/** YYYY-MM-DD in the given timezone (used for daily dedup keys). */
export function localDate(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

/**
 * Is `nowHHMM` inside the [start, end) quiet-hours window? Handles windows that
 * wrap past midnight (e.g. 22:00 → 07:00). Strings are zero-padded "HH:MM", so
 * lexical comparison is correct. An empty window (start === end) is never quiet.
 */
export function inQuietHours(nowHHMM: string, start: string, end: string): boolean {
  if (!start || !end || start === end) return false;
  if (start < end) return nowHHMM >= start && nowHHMM < end; // same-day window
  return nowHHMM >= start || nowHHMM < end; // wraps midnight
}
