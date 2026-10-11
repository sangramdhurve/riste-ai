"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SettingsView = {
  killSwitch: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxPerContactPerDay: number;
  requireConsent: boolean;
  defaultAutonomy: "SUPERVISED" | "AUTO_GREETINGS" | "FULL_AUTO";
  reminderTime: string;
  aiDisclosure: boolean;
  disclosureText: string;
};

async function save(body: Partial<SettingsView>): Promise<string | null> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return typeof data.error === "string" ? data.error : "Couldn't save. Please try again.";
}

export function KillSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!on && !confirm("Pause all sending? Nothing is drafted or sent until you resume. Reminders and note suggestions still arrive.")) return;
    setBusy(true);
    const err = await save({ killSwitch: !on });
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  }

  return (
    <div className={`verdict ${on ? "no" : "go"}`}>
      <h3>{on ? "⏸ Sending is paused" : "▶ Sending is on"}</h3>
      <p>
        {on
          ? "Nothing is drafted or sent to anyone, not even messages you approve. Reminders and note suggestions still arrive."
          : "Messages go out when you approve them, or on their own for contacts you've loosened."}
      </p>
      <div className="btns" style={{ marginTop: 12 }}>
        <button className={`btn ${on ? "b-go" : "b-no"}`} disabled={busy} onClick={toggle}>
          {on ? "▶ Resume sending" : "⏸ Pause all sending"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsForm({ initial }: { initial: SettingsView }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const set = <K extends keyof SettingsView>(k: K, v: SettingsView[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setStatus(null);
  };

  async function submit() {
    if (initial.requireConsent && !f.requireConsent) {
      const ok = confirm(
        "Message people who haven't agreed to hear from you? This can break anti-spam rules and annoy people. Turn the consent check off anyway?"
      );
      if (!ok) return;
    }
    setBusy(true);
    const { killSwitch: _k, ...rest } = f;
    const err = await save(rest);
    setBusy(false);
    setStatus(err ? { ok: false, text: err } : { ok: true, text: "Saved" });
    if (!err) router.refresh();
  }

  return (
    <div className="form settings">
      <h3>Automatic sending</h3>
      <p className="hint">These apply only to messages that go out on their own. When you tap Approve, it sends right away.</p>
      <div className="grid2">
        <label>
          Quiet hours start
          <input type="time" value={f.quietHoursStart} disabled={busy} onChange={(e) => set("quietHoursStart", e.target.value)} />
        </label>
        <label>
          Quiet hours end
          <input type="time" value={f.quietHoursEnd} disabled={busy} onChange={(e) => set("quietHoursEnd", e.target.value)} />
        </label>
      </div>
      <p className="hint" style={{ marginTop: -6 }}>
        In each contact's own time zone. Set both to the same time to turn quiet hours off.
      </p>
      <label>
        Most messages per person per day
        <input
          type="number"
          min={1}
          max={10}
          value={f.maxPerContactPerDay}
          disabled={busy}
          onChange={(e) => set("maxPerContactPerDay", Number(e.target.value))}
        />
      </label>

      <h3>Consent</h3>
      <label className="check">
        <input type="checkbox" checked={f.requireConsent} disabled={busy} onChange={(e) => set("requireConsent", e.target.checked)} />
        Only message people who have agreed to hear from me
      </label>
      {!f.requireConsent && (
        <p className="hint warn">Off: messages can go to people who never agreed. Keep this on unless you have a good reason.</p>
      )}

      <h3>New contacts</h3>
      <label>
        Start new contacts as
        <select
          value={f.defaultAutonomy}
          disabled={busy}
          onChange={(e) => set("defaultAutonomy", e.target.value as SettingsView["defaultAutonomy"])}
        >
          <option value="SUPERVISED">Supervised: I approve everything (recommended)</option>
          <option value="AUTO_GREETINGS">Greetings go on their own, I approve replies</option>
          <option value="FULL_AUTO">Confident replies go on their own too</option>
        </select>
      </label>

      <h3>Notebook</h3>
      <label>
        Daily reminders arrive at
        <input type="time" value={f.reminderTime} disabled={busy} onChange={(e) => set("reminderTime", e.target.value)} />
      </label>
      <p className="hint" style={{ marginTop: -6 }}>In each contact's own time zone.</p>

      <h3>Being open about it</h3>
      <label className="check">
        <input type="checkbox" checked={f.aiDisclosure} disabled={busy} onChange={(e) => set("aiDisclosure", e.target.checked)} />
        Add a short line to greetings saying I had help writing them
      </label>
      {f.aiDisclosure && (
        <label style={{ marginTop: 10 }}>
          Line to add
          <input
            type="text"
            maxLength={120}
            value={f.disclosureText}
            disabled={busy}
            placeholder="(sent with a little help from my assistant)"
            onChange={(e) => set("disclosureText", e.target.value)}
          />
        </label>
      )}

      <div className="btns" style={{ alignItems: "center", marginTop: 16 }}>
        <button className="btn b-go" disabled={busy || !dirty} onClick={submit}>
          Save settings
        </button>
        {dirty && (
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setF(initial);
              setStatus(null);
            }}
          >
            Undo changes
          </button>
        )}
        {status && <span className={`meta ${status.ok ? "" : "warn"}`}>{status.ok ? "✓ " : "⚠️ "}{status.text}</span>}
      </div>
    </div>
  );
}
