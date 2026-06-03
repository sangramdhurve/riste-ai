import { prisma } from "@/lib/db";
import { refreshFestivals } from "@/lib/festivals/calendarific";

/**
 * Ensures the current year's festivals are loaded. Runs on worker start and
 * once a day after — so the yearly Calendarific pull happens automatically
 * (e.g. it picks up the new year on Jan 1 without you doing anything).
 */
export function startFestivalRefresh() {
  if (!process.env.CALENDARIFIC_API_KEY) {
    console.log("[festival-refresh] CALENDARIFIC_API_KEY not set — skipping");
    return;
  }

  const ensure = async () => {
    try {
      const year = new Date().getFullYear();
      const has = await prisma.festival.findFirst({ where: { date: { startsWith: String(year) } } });
      if (!has) {
        const n = await refreshFestivals(year);
        console.log(`[festival-refresh] loaded ${n} festivals for ${year}`);
      }
    } catch (err) {
      console.error("[festival-refresh] error:", err);
    }
  };

  ensure();
  setInterval(ensure, 24 * 60 * 60 * 1000);
  console.log("[festival-refresh] started (daily check)");
}
