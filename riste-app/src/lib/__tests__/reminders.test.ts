import { describe, it, expect } from "vitest";
import {
  addDays,
  reminderReasonForToday,
  reminderText,
  reminderDraftPrompt,
  type ReminderNote,
} from "@/lib/notes/reminders";
import { escapeHtml, approvalMessage, reminderMessage } from "@/lib/notify/telegram";
import { jobId } from "@/lib/jobid";

const TODAY = "2026-10-11";
function n(over: Partial<ReminderNote>): ReminderNote {
  return {
    kind: "EVENT",
    text: "Exam in Pune",
    eventDate: null,
    sensitive: false,
    status: "ACTIVE",
    createdDate: "2026-10-01",
    snoozedUntil: null,
    ...over,
  };
}
const reasonOn = (note: ReminderNote, offsetDays: number) => reminderReasonForToday(note, addDays(TODAY, offsetDays));

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("reminderReasonForToday — events", () => {
  const exam = n({ eventDate: TODAY });

  it("reminds on the day and asks how it went the day after", () => {
    expect(reasonOn(exam, -1)).toBeNull(); // the day before: the greeting covers it
    expect(reasonOn(exam, 0)).toBe("EVENT_TODAY");
    expect(reasonOn(exam, 1)).toBe("EVENT_AFTER");
    expect(reasonOn(exam, 2)).toBeNull();
    expect(reasonOn(exam, 7)).toBeNull(); // no week-later check-in for everyday events
  });

  it("adds a one-week check-in only for private events", () => {
    const surgery = n({ text: "Dad's surgery", eventDate: TODAY, sensitive: true });
    expect(reasonOn(surgery, 7)).toBe("EVENT_CHECKIN");
    expect(reasonOn(surgery, 14)).toBeNull();
  });

  it("ignores done notes, undated events and facts", () => {
    expect(reasonOn(n({ eventDate: TODAY, status: "DONE" }), 0)).toBeNull();
    expect(reasonOn(n({ eventDate: null }), 0)).toBeNull();
    expect(reasonOn(n({ kind: "FACT", eventDate: TODAY }), 0)).toBeNull();
  });
});

describe("reminderReasonForToday — promises", () => {
  it("without a due date: nudges 3 days after writing it, then weekly", () => {
    const p = n({ kind: "PROMISE", text: "Send the book", createdDate: TODAY });
    const days = Array.from({ length: 30 }, (_, d) => d).filter((d) => reasonOn(p, d) === "PROMISE_OPEN");
    expect(days).toEqual([3, 7, 14, 21, 28]);
  });

  it("with a due date: on the day, then 3 days late, then weekly", () => {
    const p = n({ kind: "PROMISE", eventDate: TODAY });
    expect(reasonOn(p, -2)).toBeNull();
    expect(reasonOn(p, 0)).toBe("PROMISE_DUE");
    const late = Array.from({ length: 22 }, (_, d) => d + 1).filter((d) => reasonOn(p, d) === "PROMISE_OPEN");
    expect(late).toEqual([3, 7, 14, 21]);
  });
});

describe("snooze", () => {
  it("silences a note until the snooze day, then fires once on it", () => {
    const p = n({ eventDate: TODAY, snoozedUntil: addDays(TODAY, 3) });
    expect(reasonOn(p, 0)).toBeNull(); // would have been EVENT_TODAY
    expect(reasonOn(p, 1)).toBeNull(); // would have been EVENT_AFTER
    expect(reasonOn(p, 3)).toBe("SNOOZE_END");
    expect(reasonOn(p, 4)).toBeNull();
  });
});

describe("reminderText", () => {
  it("speaks plainly and names the person", () => {
    expect(reminderText("EVENT_TODAY", n({ eventDate: TODAY }), "Priya", TODAY)).toBe(
      "Today: Exam in Pune. Send Priya a quick message?"
    );
    expect(reminderText("EVENT_AFTER", n({ eventDate: "2026-10-10" }), "Priya", TODAY)).toBe(
      "Yesterday: Exam in Pune. Ask Priya how it went."
    );
    expect(reminderText("EVENT_CHECKIN", n({ text: "Dad's surgery", sensitive: true }), "Rohan", TODAY)).toBe(
      "It's been a week since: Dad's surgery. Check in on Rohan."
    );
  });

  it("says how long a promise has been open", () => {
    expect(reminderText("PROMISE_OPEN", n({ kind: "PROMISE", text: "Send the book", createdDate: "2026-10-04" }), "Aai", TODAY)).toBe(
      "You promised Aai: Send the book. Still open (promised 7 days ago)."
    );
    expect(reminderText("PROMISE_OPEN", n({ kind: "PROMISE", text: "Call", eventDate: "2026-10-08" }), "Aai", TODAY)).toBe(
      "You promised Aai: Call. Still open (3 days overdue)."
    );
    expect(reminderText("PROMISE_DUE", n({ kind: "PROMISE", text: "Call", eventDate: TODAY }), "Aai", TODAY)).toBe(
      "You promised Aai: Call. Due today."
    );
  });
});

describe("reminderDraftPrompt", () => {
  it("never drafts for a private note", () => {
    for (const reason of ["EVENT_TODAY", "EVENT_AFTER", "EVENT_CHECKIN", "SNOOZE_END"] as const) {
      expect(reminderDraftPrompt(reason, n({ eventDate: TODAY, sensitive: true }), TODAY)).toBeNull();
    }
  });

  it("frames events as theirs and promises honestly", () => {
    const p = reminderDraftPrompt("EVENT_AFTER", n({ eventDate: "2026-10-10" }), TODAY)!;
    expect(p).toContain("how this went");
    expect(p).toContain("THEIR event, not yours");
    const promise = reminderDraftPrompt("PROMISE_OPEN", n({ kind: "PROMISE", text: "Send the book" }), TODAY)!;
    expect(promise).toContain('"Send the book"');
    expect(promise).toContain("Do not claim it is already done");
  });

  it("after a snooze, asks how a past event went or wishes for an upcoming one", () => {
    expect(reminderDraftPrompt("SNOOZE_END", n({ eventDate: "2026-10-04" }), TODAY)).toContain("how this went");
    expect(reminderDraftPrompt("SNOOZE_END", n({ eventDate: "2026-10-13" }), TODAY)).toContain("coming up for them in 2 days");
  });
});

describe("Telegram formatting", () => {
  it("escapes the characters HTML mode cares about, and leaves * and _ alone", () => {
    expect(escapeHtml("a < b && c > d")).toBe("a &lt; b &amp;&amp; c &gt; d");
    expect(escapeHtml("*bold* _maybe_")).toBe("*bold* _maybe_");
  });

  it("escapes user text inside approval notices", () => {
    const m = approvalMessage({
      messageId: "m1",
      contactName: "Rohan <3",
      relationship: "friend",
      channel: "SMS",
      body: "see u @ 5 & bring *snacks*",
      reason: "awaiting_approval",
    });
    expect(m.text).toContain("<b>Rohan &lt;3</b>");
    expect(m.text).toContain("see u @ 5 &amp; bring *snacks*");
  });

  it("offers Draft only for non-private reminders, with button data under Telegram's 64-byte limit", () => {
    const id = "cmv3o235k0001dsskrut6s1cs";
    const open = reminderMessage({ reminderId: id, contactName: "Priya", relationship: "friend", text: "Today: Exam", canDraft: true });
    const priv = reminderMessage({ reminderId: id, contactName: "Rohan", relationship: "friend", text: "Today: Dad's surgery", canDraft: false });
    const datas = (m: typeof open) => m.buttons.flat().map((b) => b.callback_data);
    expect(datas(open)).toContain(`rdraft:${id}`);
    expect(datas(priv)).not.toContain(`rdraft:${id}`);
    expect(priv.text).toContain("for you to write yourself");
    for (const d of datas(open)) expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
  });
});

describe("jobId", () => {
  it("never contains ':' so the queue accepts it", () => {
    const id = jobId("greeting", "c1", "festival", "Diwali: Day 1", "2026-10-11");
    expect(id).toBe("greeting|c1|festival|Diwali- Day 1|2026-10-11");
    expect(id).not.toContain(":");
    expect(jobId("greeting", "c1", "morning", undefined, "2026-10-11")).toBe("greeting|c1|morning||2026-10-11");
  });
});
