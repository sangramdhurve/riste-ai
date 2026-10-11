"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReminderActions({ id, canDraft }: { id: string; canDraft: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function act(action: string, days?: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error === "already handled" ? "This reminder was already handled." : "Couldn't do that. Please try again.");
        router.refresh();
        return;
      }
      setResult(data.message ?? "Done");
      // Leave the drafting note up for a moment; the draft lands in the queue shortly.
      setTimeout(() => router.refresh(), action === "draft" ? 4000 : 600);
    } finally {
      setBusy(false);
    }
  }

  if (result) return <div className="meta">✓ {result}</div>;

  return (
    <div className="btns">
      <button className="btn b-go" disabled={busy} onClick={() => act("done")}>
        ✓ Done
      </button>
      {canDraft ? (
        <button className="btn" disabled={busy} onClick={() => act("draft")}>
          ✍️ Draft a message
        </button>
      ) : (
        <span className="meta" style={{ alignSelf: "center" }}>
          🔒 Private: write this one yourself
        </span>
      )}
      <button className="btn" disabled={busy} onClick={() => act("snooze", 1)}>
        💤 Tomorrow
      </button>
      <button className="btn" disabled={busy} onClick={() => act("snooze", 7)}>
        💤 Next week
      </button>
      <button className="btn" disabled={busy} onClick={() => act("dismiss")}>
        ✕ Dismiss
      </button>
    </div>
  );
}
