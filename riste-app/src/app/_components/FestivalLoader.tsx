"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Loads this year's festival dates. Shown when the calendar is empty. */
export default function FestivalLoader({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/festivals/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNote(`Loaded ${data.imported ?? 0} festival dates for ${data.year}.`);
        router.refresh();
      } else if (data.error === "not_set_up") {
        setNote("Festival dates aren't connected yet. Add the holiday calendar key to the settings file first.");
      } else {
        setNote("Couldn't load festival dates right now. Please try again later.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="empty">
      <div>No festivals loaded yet.</div>
      {connected ? (
        <div className="btns" style={{ justifyContent: "center", marginTop: 12 }}>
          <button className="btn b-go" disabled={busy} onClick={load}>
            {busy ? "Loading…" : "Load this year's festivals"}
          </button>
        </div>
      ) : (
        <div className="hint" style={{ marginTop: 8 }}>
          Festival dates aren't connected yet. Add the holiday calendar key to the settings file (see the setup guide), then
          come back here to load them.
        </div>
      )}
      {note && <div className="hint" style={{ marginTop: 8 }}>{note}</div>}
    </div>
  );
}
