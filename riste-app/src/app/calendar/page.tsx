import { prisma } from "@/lib/db";
import FestivalLoader from "../_components/FestivalLoader";

export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso + "T00:00:00")
  );

export default async function Calendar() {
  const today = new Date().toISOString().slice(0, 10);
  const [festivals, contacts] = await Promise.all([
    prisma.festival.findMany({ where: { date: { gte: today } }, orderBy: { date: "asc" }, take: 40 }),
    prisma.contact.findMany({ where: { active: true } }),
  ]);

  // For each festival, who would be wished (tag overlap or "all").
  const recipientsFor = (tags: string[]) =>
    contacts
      .filter((c) => {
        const opted = new Set(c.festivals.map((t) => t.toLowerCase()));
        return opted.has("all") || tags.some((t) => opted.has(t));
      })
      .map((c) => c.name);

  return (
    <>
      <h2>Upcoming festivals ({festivals.length})</h2>
      {festivals.length === 0 && <FestivalLoader connected={!!process.env.CALENDARIFIC_API_KEY} />}
      {festivals.map((f) => {
        const who = recipientsFor(f.tags);
        return (
          <div className="row" key={f.id}>
            <div className="time" style={{ minWidth: 110 }}>{fmtDate(f.date)}</div>
            <div style={{ flex: 1 }}>
              <div className="who">{f.name}</div>
              <div className="meta">{f.tags.join(" · ") || "—"}</div>
              <div className="meta">
                {who.length ? `Will wish: ${who.join(", ")}` : "No contacts opted in"}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
