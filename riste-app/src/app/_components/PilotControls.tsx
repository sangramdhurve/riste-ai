"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PilotControls({ started, notReady }: { started: boolean; notReady: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "start" | "stop") {
    if (action === "start" && notReady > 0) {
      const ok = confirm(
        `${notReady} readiness check${notReady === 1 ? " isn't" : "s aren't"} green yet. Start the two-week pilot anyway?`
      );
      if (!ok) return;
    }
    if (action === "start" && started && !confirm("Restart the pilot from today? Results so far will no longer count.")) return;
    if (action === "stop" && !confirm("Stop the pilot? The results will be hidden until you start again.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) alert("Couldn't do that. Please try again.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="btns" style={{ marginTop: 12 }}>
      {started ? (
        <>
          <button className="btn" disabled={busy} onClick={() => act("start")}>
            ↺ Restart from today
          </button>
          <button className="btn b-no" disabled={busy} onClick={() => act("stop")}>
            Stop pilot
          </button>
        </>
      ) : (
        <button className="btn b-go" disabled={busy} onClick={() => act("start")}>
          ▶ Start the two-week pilot
        </button>
      )}
    </div>
  );
}
