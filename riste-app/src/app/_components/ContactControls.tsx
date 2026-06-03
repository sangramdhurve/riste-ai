"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ContactControls({
  id,
  autonomy,
  active,
}: {
  id: string;
  autonomy: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this contact and all their messages?")) return;
    setBusy(true);
    try {
      await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="btns">
      <select
        value={autonomy}
        disabled={busy}
        onChange={(e) => patch({ autonomy: e.target.value })}
        className="btn"
      >
        <option value="SUPERVISED">supervised</option>
        <option value="AUTO_GREETINGS">auto-greetings</option>
        <option value="FULL_AUTO">full-auto</option>
      </select>
      <button className="btn" disabled={busy} onClick={() => patch({ active: !active })}>
        {active ? "⏸ Pause" : "▶ Activate"}
      </button>
      <button className="btn b-no" disabled={busy} onClick={remove}>
        🗑 Delete
      </button>
    </div>
  );
}
