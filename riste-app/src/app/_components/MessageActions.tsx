"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Why a send was blocked, in plain words (the reasons come from the send guardrails).
const BLOCKED: Record<string, string> = {
  kill_switch: "Sending is paused. Resume it in Settings first.",
  opted_out: "They've opted out of messages on this channel, so it wasn't sent.",
  no_consent: "They haven't agreed to messages on this channel yet, so it wasn't sent.",
};

function failureText(path: string, data: { error?: string; reason?: string }): string {
  if (path.endsWith("approve")) {
    if (data.error === "blocked") return BLOCKED[data.reason ?? ""] ?? "This message was held back and not sent.";
    if (data.error === "rejected") return "This draft was already rejected.";
    return "Couldn't send it. It's marked as failed under Activity.";
  }
  if (path.endsWith("regenerate")) return "Couldn't write a new draft right now. Please try again.";
  return "Couldn't do that. Please try again.";
}

export default function MessageActions({ id, initialBody }: { id: string; initialBody: string }) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);

  async function call(path: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(failureText(path, data));
        router.refresh();
        return;
      }
      if (path.endsWith("regenerate")) {
        const data = await res.json();
        if (data?.body) setBody(data.body);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} disabled={busy} />
      <div className="btns">
        <button className="btn b-go" disabled={busy} onClick={() => call("/api/messages/approve", { id, body })}>
          ✅ Approve &amp; send
        </button>
        <button className="btn" disabled={busy} onClick={() => call("/api/messages/regenerate", { id })}>
          🔄 Regenerate
        </button>
        <button className="btn b-no" disabled={busy} onClick={() => call("/api/messages/reject", { id })}>
          🗑 Reject
        </button>
      </div>
    </div>
  );
}
