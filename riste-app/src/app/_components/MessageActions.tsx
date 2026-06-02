"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        alert("Action failed — check the worker/logs.");
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
