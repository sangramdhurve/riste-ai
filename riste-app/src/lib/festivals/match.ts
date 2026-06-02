import { prisma } from "@/lib/db";

/**
 * Decide whether today is a special day for this contact.
 * - Birthday: a contact tag like "birthday:1990-05-12" or "birthday:05-12".
 * - Festival: a stored Festival on today's date whose tags overlap the contact's
 *   opted-in tags (e.g. contact has ["hindu","national holiday"]). "all" matches any.
 * Returns the wish name (e.g. "Diwali", "birthday") or null.
 */
export async function matchSpecialDay(
  contactFestivals: string[],
  todayLocal: string // YYYY-MM-DD
): Promise<string | null> {
  const mmdd = todayLocal.slice(5); // MM-DD
  for (const tag of contactFestivals) {
    if (tag.toLowerCase().startsWith("birthday:")) {
      const d = tag.split(":")[1] ?? "";
      const tagMmdd = d.length === 10 ? d.slice(5) : d; // accept YYYY-MM-DD or MM-DD
      if (tagMmdd === mmdd) return "birthday";
    }
  }

  const opted = new Set(contactFestivals.map((t) => t.toLowerCase()));
  if (opted.size === 0) return null;

  const todays = await prisma.festival.findMany({ where: { date: todayLocal } });
  for (const f of todays) {
    if (opted.has("all") || f.tags.some((t) => opted.has(t))) return f.name;
  }
  return null;
}
