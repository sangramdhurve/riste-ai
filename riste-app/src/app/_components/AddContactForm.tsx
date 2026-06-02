"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const empty = {
  name: "",
  relationship: "",
  channelType: "EMAIL",
  channelValue: "",
  morningTime: "08:00",
  eveningTime: "",
  autonomy: "SUPERVISED",
  festivals: "",
  languageMix: "",
  styleNotes: "",
  sampleMessages: "",
};

export default function AddContactForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...empty });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit() {
    if (!f.name || !f.relationship || !f.channelValue) {
      alert("Name, relationship and a contact value are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          relationship: f.relationship,
          autonomy: f.autonomy,
          morningTime: f.morningTime || null,
          eveningTime: f.eveningTime || null,
          festivals: f.festivals.split(",").map((s) => s.trim()).filter(Boolean),
          languageMix: f.languageMix,
          styleNotes: f.styleNotes,
          sampleMessages: f.sampleMessages.split("\n").map((s) => s.trim()).filter(Boolean),
          channels: [{ type: f.channelType, value: f.channelValue, isPrimary: true }],
        }),
      });
      if (!res.ok) {
        alert("Could not add contact.");
        return;
      }
      setF({ ...empty });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn b-go" onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        ＋ Add contact
      </button>
    );
  }

  return (
    <div className="form">
      <div className="grid2">
        <label>Name<input value={f.name} onChange={set("name")} placeholder="Aai" /></label>
        <label>Relationship<input value={f.relationship} onChange={set("relationship")} placeholder="mother" /></label>
        <label>
          Channel
          <select value={f.channelType} onChange={set("channelType")}>
            <option value="EMAIL">Email</option>
            <option value="SMS">SMS</option>
          </select>
        </label>
        <label>Contact value<input value={f.channelValue} onChange={set("channelValue")} placeholder="aai@example.com / +9198…" /></label>
        <label>Morning time<input value={f.morningTime} onChange={set("morningTime")} placeholder="08:00" /></label>
        <label>Evening time<input value={f.eveningTime} onChange={set("eveningTime")} placeholder="21:00 (optional)" /></label>
        <label>
          Autonomy
          <select value={f.autonomy} onChange={set("autonomy")}>
            <option value="SUPERVISED">Supervised (approve all)</option>
            <option value="AUTO_GREETINGS">Auto greetings</option>
            <option value="FULL_AUTO">Full auto</option>
          </select>
        </label>
        <label>Festival tags<input value={f.festivals} onChange={set("festivals")} placeholder="hindu, national holiday, birthday:1990-05-12" /></label>
        <label>Language mix<input value={f.languageMix} onChange={set("languageMix")} placeholder="Hindi-English" /></label>
      </div>
      <label>Style notes<input value={f.styleNotes} onChange={set("styleNotes")} placeholder="short, warm, calls her Aai, emojis" /></label>
      <label>
        Past messages (one per line — seeds your voice)
        <textarea rows={4} value={f.sampleMessages} onChange={set("sampleMessages")} placeholder={"Good morning Aai 🌸\nKhana kha liya?"} />
      </label>
      <div className="btns">
        <button className="btn b-go" disabled={busy} onClick={submit}>Save contact</button>
        <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
