import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import AddContactForm from "../_components/AddContactForm";
import ContactControls from "../_components/ContactControls";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const contacts = await prisma.contact.findMany({
    include: {
      channels: true,
      _count: { select: { messages: true, notes: { where: { status: { in: ["ACTIVE", "DONE"] } } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const { defaultAutonomy } = await getSetting();

  return (
    <>
      <h2>Contacts ({contacts.length})</h2>
      <AddContactForm defaultAutonomy={defaultAutonomy} />
      {contacts.length === 0 && (
        <div className="empty">No contacts yet. Use “Add contact” above to add the first person you want to stay in touch with.</div>
      )}
      {contacts.map((c) => (
        <div className="row" key={c.id}>
          <div style={{ flex: 1 }}>
            <div>
              <a className="who" href={`/contacts/${c.id}`}>{c.name}</a> <span className="rel">· {c.relationship}</span>
              {!c.active && <span className="badge b-held" style={{ marginLeft: 8 }}>paused</span>}
            </div>
            <div className="meta">
              {c.channels.map((ch) => `${ch.type.toLowerCase()}: ${ch.value}`).join(" · ")}
            </div>
            <div className="meta">
              {c.morningTime ? `🌅 ${c.morningTime}` : ""} {c.eveningTime ? `🌙 ${c.eveningTime}` : ""} ·{" "}
              {c._count.messages} messages ·{" "}
              <a href={`/contacts/${c.id}`}>
                📓 {c._count.notes ? `${c._count.notes} note${c._count.notes === 1 ? "" : "s"}` : "Open notebook"}
              </a>
            </div>
            <ContactControls
              id={c.id}
              autonomy={c.autonomy}
              active={c.active}
              channels={c.channels.map((ch) => ({
                id: ch.id,
                type: ch.type,
                value: ch.value,
                consentStatus: ch.consentStatus,
                optedOutAt: ch.optedOutAt,
              }))}
            />
          </div>
        </div>
      ))}
    </>
  );
}
