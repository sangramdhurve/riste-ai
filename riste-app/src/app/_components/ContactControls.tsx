"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ChannelInfo = {
  id: string;
  type: string;
  value: string;
  consentStatus: string;
  optedOutAt: string | Date | null;
};

export default function ContactControls({
  id,
  autonomy,
  active,
  channels = [],
}: {
  id: string;
  autonomy: string;
  active: boolean;
  channels?: ChannelInfo[];
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

  async function setConsent(channelId: string, status: string) {
    setBusy(true);
    try {
      await fetch(`/api/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, status, source: "operator" }),
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

  const consentChip = (status: string, optedOut: boolean) => {
    if (optedOut) return <span className="badge b-failed">opted out</span>;
    if (status === "GRANTED") return <span className="badge b-sent">consent ✓</span>;
    return <span className="badge b-held">no consent</span>;
  };

  return (
    <div>
      {channels.length > 0 && (
        <div className="btns" style={{ marginBottom: 4 }}>
          {channels.map((ch) => {
            const optedOut = !!ch.optedOutAt;
            const granted = ch.consentStatus === "GRANTED" && !optedOut;
            return (
              <span key={ch.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <span className="meta">{ch.type.toLowerCase()}</span>
                {consentChip(ch.consentStatus, optedOut)}
                {!granted ? (
                  <button className="btn b-go" disabled={busy} onClick={() => setConsent(ch.id, "GRANTED")}>
                    Grant
                  </button>
                ) : (
                  <button className="btn b-no" disabled={busy} onClick={() => setConsent(ch.id, "REVOKED")}>
                    Revoke
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
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
    </div>
  );
}
