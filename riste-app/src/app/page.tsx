import { prisma } from "@/lib/db";
import MessageActions from "./_components/MessageActions";

export const dynamic = "force-dynamic";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true }).format(d);

function statusBadge(status: string, direction: string) {
  if (direction === "IN") return <span className="badge b-in">📥 received</span>;
  const map: Record<string, [string, string]> = {
    SENT: ["b-sent", "✅ sent"],
    DELIVERED: ["b-sent", "✅ delivered"],
    READ: ["b-sent", "✅ read"],
    HELD: ["b-held", "⚠️ needs you"],
    AWAITING_APPROVAL: ["b-await", "🕒 approve"],
    QUEUED: ["b-await", "🕒 queued"],
    FAILED: ["b-failed", "❌ failed"],
    REJECTED: ["b-failed", "🗑 rejected"],
  };
  const [cls, label] = map[status] ?? ["", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default async function Home() {
  const recent = await prisma.message.findMany({
    include: { contact: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const attention = recent.filter((m) => m.status === "HELD" || m.status === "AWAITING_APPROVAL");

  return (
    <>
      <h2>Needs your attention ({attention.length})</h2>
      {attention.length === 0 && <div className="empty">Nothing waiting. 🎉</div>}
      {attention.map((m) => (
        <div className="row" key={m.id}>
          <div className="time">{fmt(m.createdAt)}</div>
          <div style={{ flex: 1 }}>
            <div>
              <span className="who">{m.contact.name}</span>{" "}
              <span className="rel">· {m.contact.relationship}</span>{" "}
              {statusBadge(m.status, m.direction)}
            </div>
            {m.direction === "OUT" ? (
              <MessageActions id={m.id} initialBody={m.body} />
            ) : (
              <div className="body">{m.body}</div>
            )}
            <div className="meta">{m.channel.toLowerCase()} · {m.aiGenerated ? "AI draft" : "you"}</div>
          </div>
        </div>
      ))}

      <h2>Activity</h2>
      {recent.length === 0 && <div className="empty">No messages yet. Add a contact to begin.</div>}
      {recent.map((m) => (
        <div className="row" key={m.id}>
          <div className="time">{fmt(m.createdAt)}</div>
          <div style={{ flex: 1 }}>
            <div>
              <span className="who">{m.contact.name}</span>{" "}
              <span className="rel">· {m.contact.relationship} · {m.channel.toLowerCase()}</span>
            </div>
            <div className="body">{m.body}</div>
          </div>
          {statusBadge(m.status, m.direction)}
        </div>
      ))}
    </>
  );
}
