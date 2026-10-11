import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { localDate } from "@/lib/time";
import { selectDraftNotes } from "@/lib/notes/select";
import Notebook from "../../_components/Notebook";
import ProposedNote from "../../_components/ProposedNote";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: { id: string } }) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      channels: true,
      notes: { orderBy: { createdAt: "desc" }, include: { sourceMessage: { select: { direction: true, body: true } } } },
    },
  });
  if (!contact) notFound();

  const today = localDate(contact.timezone);
  const usable = selectDraftNotes(contact.notes, today);
  const kept = contact.notes.filter((n) => n.status === "ACTIVE" || n.status === "DONE");
  const proposed = contact.notes.filter((n) => n.status === "PROPOSED");
  const usableCount = usable.about.length + usable.promises.length;

  return (
    <>
      <a className="back" href="/contacts">← Contacts</a>
      <div className="contact-head">
        <span className="name">{contact.name}</span>
        <span className="rel">· {contact.relationship}</span>
        {!contact.active && <span className="badge b-held">paused</span>}
      </div>
      <div className="meta">
        {contact.channels.map((ch) => `${ch.type.toLowerCase()}: ${ch.value}`).join(" · ")}
      </div>

      {proposed.length > 0 && (
        <>
          <h2>📝 Suggested from messages ({proposed.length})</h2>
          <p className="meta" style={{ marginTop: -4, marginBottom: 12 }}>
            Riste picked these out of your conversation. They aren't used anywhere until you keep them.
          </p>
          {proposed.map((n) => (
            <ProposedNote
              key={n.id}
              today={today}
              note={{
                id: n.id,
                kind: n.kind,
                text: n.text,
                eventDate: n.eventDate,
                sensitive: n.sensitive,
                source: n.sourceMessage,
              }}
            />
          ))}
        </>
      )}

      <h2>📓 Notebook</h2>
      <p className="meta" style={{ marginTop: -4, marginBottom: 12 }}>
        {usableCount > 0
          ? `Drafts for ${contact.name} can use ${usableCount} of these notes right now. `
          : `Drafts for ${contact.name} aren't using any notes right now. `}
        Private notes, finished ones, and events more than a week away or two weeks past are left out.
      </p>
      <Notebook
        contactId={contact.id}
        contactName={contact.name}
        today={today}
        notes={kept.map((n) => ({
          id: n.id,
          kind: n.kind,
          text: n.text,
          eventDate: n.eventDate,
          sensitive: n.sensitive,
          status: n.status as "ACTIVE" | "DONE",
          snoozedUntil: n.snoozedUntil,
        }))}
      />
    </>
  );
}
