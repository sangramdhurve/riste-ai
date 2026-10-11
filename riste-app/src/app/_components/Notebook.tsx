"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { looksSensitive } from "@/lib/notes/sensitive";
import { daysBetween, relativeDay } from "@/lib/notes/select";

type Kind = "FACT" | "EVENT" | "PROMISE";
export type NoteView = {
  id: string;
  kind: Kind;
  text: string;
  eventDate: string | null;
  sensitive: boolean;
  status: "ACTIVE" | "DONE";
  snoozedUntil: string | null;
};

const KIND_LABEL: Record<Kind, string> = { FACT: "Remember", EVENT: "Event", PROMISE: "Promise" };
const KIND_ICON: Record<Kind, string> = { FACT: "💭", EVENT: "📅", PROMISE: "🤝" };
const PLACEHOLDER: Record<Kind, string> = {
  FACT: "e.g. Her daughter is called Meera; loves filter coffee",
  EVENT: "e.g. Exam in Pune",
  PROMISE: "e.g. Send her the book I mentioned",
};
const DATE_LABEL: Record<Kind, string> = { FACT: "", EVENT: "When", PROMISE: "Due (optional)" };

async function send(path: string, method: string, body?: unknown): Promise<boolean> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) alert("Couldn't save that. Please try again.");
  return res.ok;
}

function byDateThenNewest(a: NoteView, b: NoteView) {
  if (a.eventDate && b.eventDate) return a.eventDate.localeCompare(b.eventDate);
  if (a.eventDate) return -1;
  if (b.eventDate) return 1;
  return 0;
}

export default function Notebook({
  contactId,
  contactName,
  today,
  notes,
}: {
  contactId: string;
  contactName: string;
  today: string;
  notes: NoteView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Kind>("FACT");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [priv, setPriv] = useState(false);
  const [privTouched, setPrivTouched] = useState(false);

  const autoPrivate = !privTouched && looksSensitive(text);
  const isPrivate = privTouched ? priv : autoPrivate;

  async function run(fn: () => Promise<boolean>) {
    setBusy(true);
    try {
      if (await fn()) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!text.trim()) return;
    if (kind === "EVENT" && !date) {
      alert("Pick a date for the event.");
      return;
    }
    await run(async () => {
      const ok = await send(`/api/contacts/${contactId}/notes`, "POST", {
        kind,
        text,
        eventDate: kind === "FACT" ? null : date || null,
        sensitive: isPrivate,
      });
      if (ok) {
        setText("");
        setDate("");
        setPriv(false);
        setPrivTouched(false);
      }
      return ok;
    });
  }

  const active = notes.filter((n) => n.status === "ACTIVE");
  const done = notes.filter((n) => n.status === "DONE");
  const groups: { kind: Kind; title: string; items: NoteView[] }[] = [
    { kind: "EVENT", title: "Events", items: active.filter((n) => n.kind === "EVENT").sort(byDateThenNewest) },
    { kind: "PROMISE", title: "Promises you made", items: active.filter((n) => n.kind === "PROMISE").sort(byDateThenNewest) },
    { kind: "FACT", title: "Things to remember", items: active.filter((n) => n.kind === "FACT") },
  ];

  return (
    <>
      <div className="form note-add">
        <div className={`line${kind === "FACT" ? " nodate" : ""}`}>
          <select value={kind} disabled={busy} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Kind of note">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_ICON[k]} {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={text}
            disabled={busy}
            maxLength={500}
            placeholder={PLACEHOLDER[kind]}
            aria-label="Note"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          {kind !== "FACT" && (
            <input
              type="date"
              value={date}
              disabled={busy}
              aria-label={DATE_LABEL[kind]}
              title={DATE_LABEL[kind]}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </div>
        <div className="btns" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <label className="check">
            <input
              type="checkbox"
              checked={isPrivate}
              disabled={busy}
              onChange={(e) => {
                setPrivTouched(true);
                setPriv(e.target.checked);
              }}
            />
            🔒 Private: a reminder for me only, never used in messages
          </label>
          <button className="btn b-go" disabled={busy || !text.trim()} onClick={add}>
            + Add note
          </button>
        </div>
        {autoPrivate && (
          <div className="hint">This sounds personal, so it's kept private. Untick it if it's fine to mention.</div>
        )}
      </div>

      {active.length === 0 && (
        <div className="empty">
          Nothing noted about {contactName} yet. Jot down what they tell you: plans, dates, the little things.
        </div>
      )}

      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.kind}>
            <h2>
              {KIND_ICON[g.kind]} {g.title} ({g.items.length})
            </h2>
            {g.items.map((n) => (
              <NoteRow key={n.id} note={n} today={today} busy={busy} run={run} />
            ))}
          </section>
        ))}

      {done.length > 0 && (
        <details className="done">
          <summary>✓ Done ({done.length})</summary>
          {done.map((n) => (
            <NoteRow key={n.id} note={n} today={today} busy={busy} run={run} />
          ))}
        </details>
      )}

      {notes.length > 0 && (
        <div className="danger-zone">
          <button
            className="btn b-no"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Delete all ${notes.length} notes about ${contactName}? This can't be undone.`)) return;
              run(() => send(`/api/contacts/${contactId}/notes`, "DELETE"));
            }}
          >
            Forget everything about {contactName}
          </button>
          <div className="hint">Deletes every note. Messages and settings stay as they are.</div>
        </div>
      )}
    </>
  );
}

function NoteRow({
  note,
  today,
  busy,
  run,
}: {
  note: NoteView;
  today: string;
  busy: boolean;
  run: (fn: () => Promise<boolean>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [date, setDate] = useState(note.eventDate ?? "");
  const [priv, setPriv] = useState(note.sensitive);
  const isDone = note.status === "DONE";

  const days = note.eventDate ? daysBetween(today, note.eventDate) : null;
  const soon = days !== null && days >= 0 && days <= 1;
  const snoozeDays = note.snoozedUntil ? daysBetween(today, note.snoozedUntil) : 0;

  function save() {
    if (!text.trim()) return;
    if (note.kind === "EVENT" && !date) {
      alert("Pick a date for the event.");
      return;
    }
    run(async () => {
      const ok = await send(`/api/notes/${note.id}`, "PATCH", {
        text,
        eventDate: note.kind === "FACT" ? null : date || null,
        sensitive: priv,
      });
      if (ok) setEditing(false);
      return ok;
    });
  }

  return (
    <div className="row">
      <div style={{ flex: 1 }}>
        {editing ? (
          <div className="note-edit">
            <input type="text" value={text} maxLength={500} disabled={busy} onChange={(e) => setText(e.target.value)} aria-label="Note" />
            {note.kind !== "FACT" && (
              <input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} aria-label={DATE_LABEL[note.kind]} />
            )}
            <label className="check">
              <input type="checkbox" checked={priv} disabled={busy} onChange={(e) => setPriv(e.target.checked)} />
              🔒 Private: never used in messages
            </label>
            <div className="btns">
              <button className="btn b-go" disabled={busy || !text.trim()} onClick={save}>
                Save
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setText(note.text);
                  setDate(note.eventDate ?? "");
                  setPriv(note.sensitive);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="note-text">{note.text}</div>
            <div className="note-meta">
              {note.eventDate && (
                <span className={`badge ${soon && !isDone ? "b-soon" : "b-date"}`} title={note.eventDate}>
                  {note.kind === "PROMISE" ? "due " : ""}
                  {relativeDay(note.eventDate, today)}
                </span>
              )}
              {note.sensitive && <span className="badge b-private">🔒 private</span>}
              {snoozeDays > 0 && !isDone && (
                <span className="badge b-private" title={`Reminders paused until ${note.snoozedUntil}`}>
                  💤 {snoozeDays === 1 ? "snoozed until tomorrow" : `snoozed for ${snoozeDays} days`}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="btns" style={{ marginTop: 0, flexWrap: "nowrap" }}>
          {isDone ? (
            <button className="btn" disabled={busy} onClick={() => run(() => send(`/api/notes/${note.id}`, "PATCH", { status: "ACTIVE" }))}>
              Undo
            </button>
          ) : (
            <>
              <button className="btn b-go" disabled={busy} onClick={() => run(() => send(`/api/notes/${note.id}`, "PATCH", { status: "DONE" }))}>
                ✓ Done
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setText(note.text);
                  setDate(note.eventDate ?? "");
                  setPriv(note.sensitive);
                  setEditing(true);
                }}
              >
                Edit
              </button>
            </>
          )}
          <button
            className="btn b-no"
            disabled={busy}
            aria-label="Delete note"
            onClick={() => confirm("Delete this note?") && run(() => send(`/api/notes/${note.id}`, "DELETE"))}
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
