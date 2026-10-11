"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { relativeDay } from "@/lib/notes/select";

type Kind = "FACT" | "EVENT" | "PROMISE";
const KIND_LABEL: Record<Kind, string> = { FACT: "💭 Remember", EVENT: "📅 Event", PROMISE: "🤝 Promise" };

export type ProposedView = {
  id: string;
  kind: Kind;
  text: string;
  eventDate: string | null;
  sensitive: boolean;
  source: { direction: "IN" | "OUT"; body: string } | null;
};

/**
 * One AI suggestion awaiting review. Nothing here is used in a draft or a
 * reminder until "Keep" moves it into the notebook (with any edits).
 */
export default function ProposedNote({
  note,
  today,
  contact,
}: {
  note: ProposedView;
  today: string;
  contact?: { id: string; name: string; relationship: string };
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(note.kind);
  const [text, setText] = useState(note.text);
  const [date, setDate] = useState(note.eventDate ?? "");
  const [priv, setPriv] = useState(note.sensitive);
  const [busy, setBusy] = useState(false);

  async function decide(status: "ACTIVE" | "DISMISSED") {
    if (status === "ACTIVE" && kind === "EVENT" && !date) {
      alert("Pick a date for the event, or keep it as something to remember.");
      return;
    }
    setBusy(true);
    try {
      const body =
        status === "ACTIVE"
          ? { status, kind, text, eventDate: kind === "FACT" ? null : date || null, sensitive: priv }
          : { status };
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) alert("Couldn't save that. Please try again.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const excerpt = note.source?.body ? note.source.body.slice(0, 160) + (note.source.body.length > 160 ? "…" : "") : null;

  return (
    <div className="row">
      <div style={{ flex: 1 }}>
        {contact && (
          <div>
            <a className="who" href={`/contacts/${contact.id}`}>
              {contact.name}
            </a>{" "}
            <span className="rel">· {contact.relationship}</span>
          </div>
        )}
        {excerpt && (
          <div className="quote">
            {note.source!.direction === "IN" ? `${contact?.name ?? "They"} said: ` : "You wrote: "}“{excerpt}”
          </div>
        )}
        <div className="note-edit">
          <div className="suggest-line">
            <select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind of note">
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <input type="text" value={text} maxLength={500} disabled={busy} onChange={(e) => setText(e.target.value)} aria-label="Suggested note" />
            {kind !== "FACT" && (
              <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
            )}
          </div>
          <div className="btns" style={{ alignItems: "center", marginTop: 0 }}>
            <label className="check">
              <input type="checkbox" checked={priv} disabled={busy} onChange={(e) => setPriv(e.target.checked)} />
              🔒 Private: never used in messages
            </label>
            {kind !== "FACT" && date && <span className="badge b-date">{relativeDay(date, today)}</span>}
          </div>
          <div className="btns" style={{ marginTop: 0 }}>
            <button className="btn b-go" disabled={busy || !text.trim()} onClick={() => decide("ACTIVE")}>
              ✓ Keep
            </button>
            <button className="btn" disabled={busy} onClick={() => decide("DISMISSED")}>
              ✕ Not useful
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
