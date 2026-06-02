import { prisma } from "@/lib/db";

/**
 * Pulls a whole year of holidays for a country from Calendarific and stores
 * them. Call this ONCE per year (the free tier is tiny but a yearly pull fits
 * easily). Curate the niche Jayantis / personal dates by adding them manually.
 */
export async function refreshFestivals(year: number, country = process.env.FESTIVAL_COUNTRY ?? "IN") {
  const key = process.env.CALENDARIFIC_API_KEY;
  if (!key) throw new Error("CALENDARIFIC_API_KEY not set");

  const res = await fetch(
    `https://calendarific.com/api/v2/holidays?api_key=${key}&country=${country}&year=${year}`
  );
  if (!res.ok) throw new Error(`Calendarific error ${res.status}`);

  const data = (await res.json()) as {
    response?: { holidays?: { name?: string; date?: { iso?: string }; type?: string[] }[] };
  };
  const holidays = data.response?.holidays ?? [];

  let count = 0;
  for (const h of holidays) {
    const date = (h.date?.iso ?? "").slice(0, 10);
    if (!date || !h.name) continue;
    const tags = (Array.isArray(h.type) ? h.type : []).map((t) => t.toLowerCase());
    await prisma.festival.upsert({
      where: { date_name: { date, name: h.name } },
      update: { tags, region: country },
      create: { name: h.name, date, tags, region: country, source: "calendarific" },
    });
    count++;
  }
  return count;
}
