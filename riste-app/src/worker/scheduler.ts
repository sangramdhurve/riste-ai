import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";
import { matchSpecialDay } from "@/lib/festivals/match";
import { localHHMM, localDate } from "@/lib/time";

/**
 * Simple minute-tick scheduler. Every minute it checks each active contact's
 * local time; if it matches their morning/evening slot, it enqueues a greeting.
 * On festival/birthday days the special wish replaces the morning greeting.
 */
export function startScheduler() {
  // Deterministic jobId = one greeting per contact/slot/day. Re-adding the same
  // id is a no-op, so duplicate ticks or worker restarts can't double-send.
  const enqueue = (
    contactId: string,
    slot: "morning" | "evening" | "festival",
    tz: string,
    festival?: string
  ) =>
    risteQueue.add(
      "greeting",
      { type: "greeting", contactId, slot, festival },
      {
        jobId: `greeting:${contactId}:${slot}:${festival ?? ""}:${localDate(tz)}`,
        removeOnComplete: false,
      }
    );

  const tick = async () => {
    try {
      const contacts = await prisma.contact.findMany({ where: { active: true } });
      for (const c of contacts) {
        const now = localHHMM(c.timezone);
        const today = localDate(c.timezone);
        const festivalTime = c.morningTime ?? "09:00";

        // On a special day, the festival/birthday wish replaces the plain
        // good-morning (fires at the morning time, or 09:00 if none set).
        if (now === festivalTime) {
          const special = await matchSpecialDay(c.festivals, today);
          if (special) {
            await enqueue(c.id, "festival", c.timezone, special);
          } else if (c.morningTime === now) {
            await enqueue(c.id, "morning", c.timezone);
          }
        } else if (c.morningTime && c.morningTime === now) {
          await enqueue(c.id, "morning", c.timezone);
        }

        if (c.eveningTime && c.eveningTime === now) await enqueue(c.id, "evening", c.timezone);
      }
    } catch (err) {
      console.error("[scheduler] tick error:", err);
    }
  };

  tick();
  setInterval(tick, 60_000);
  console.log("[scheduler] started (60s tick)");
}
