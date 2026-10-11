import { prisma } from "@/lib/db";
import AddContactForm from "../_components/AddContactForm";
import ContactControls from "../_components/ContactControls";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const contacts = await prisma.contact.findMany({
    include: { channels: true, _count: { select: { messages: true, notes: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <h2>Contacts ({contacts.length})</h2>
      <AddContactForm />
      {contacts.length === 0 && (
        <div className="empty">
          No contacts yet. Add one with:
          <pre style={{ marginTop: 8 }}>
{`curl -X POST $APP_URL/api/contacts -H "Content-Type: application/json" -d '{
  "name": "Aai", "relationship": "mother",
  "morningTime": "08:00", "eveningTime": "21:00", "autonomy": "SUPERVISED",
  "channels": [{ "type": "EMAIL", "value": "aai@example.com", "isPrimary": true }],
  "styleNotes": "warm, short, calls her Aai", "languageMix": "Hindi-English",
  "sampleMessages": ["Good morning Aai 🌸", "Khana kha liya?"]
}'`}
          </pre>
        </div>
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
