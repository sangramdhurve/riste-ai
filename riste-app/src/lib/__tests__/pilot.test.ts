import { describe, it, expect } from "vitest";
import { pilotSummary, reminderOutcome, mentionsPrivateNote, type PilotInput, type ReminderOutcome } from "@/lib/notes/pilot";
import { buildReadiness, isConfigured, ago, type ReadinessInput } from "@/lib/readiness";

const NOW = new Date("2026-10-25T10:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("reminderOutcome", () => {
  it("counts done and drafted as acted, and old open reminders as ignored", () => {
    expect(reminderOutcome("DONE", daysAgo(1), NOW)).toBe("acted");
    expect(reminderOutcome("DRAFTED", daysAgo(1), NOW)).toBe("acted");
    expect(reminderOutcome("DISMISSED", daysAgo(1), NOW)).toBe("dismissed");
    expect(reminderOutcome("SNOOZED", daysAgo(30), NOW)).toBe("snoozed");
    expect(reminderOutcome("OPEN", daysAgo(2), NOW)).toBe("pending");
    expect(reminderOutcome("OPEN", daysAgo(7), NOW)).toBe("ignored");
  });
});

describe("mentionsPrivateNote", () => {
  it("catches a message that talks about a private note", () => {
    expect(mentionsPrivateNote("hope your dad's surgery went well!", ["Dad's surgery"])).toBe(true);
    expect(mentionsPrivateNote("good morning bro, have a great day", ["Dad's surgery", "Grandfather passed away"])).toBe(false);
  });
});

function input(over: Partial<PilotInput>): PilotInput {
  const outcomes: ReminderOutcome[] = [...Array(7).fill("acted"), ...Array(3).fill("dismissed")];
  return {
    kept: 8,
    dismissed: 2,
    pendingSuggestions: 0,
    reminderOutcomes: outcomes,
    reminderSends: 3,
    reminderSendsReplied: 2,
    privateMentionsInAutoSent: 0,
    startedAt: daysAgo(15),
    now: NOW,
    ...over,
  };
}

describe("pilotSummary verdict", () => {
  it("has not started without notebook activity", () => {
    expect(pilotSummary(input({ startedAt: null, kept: 0, dismissed: 0, reminderOutcomes: [] })).verdict.title).toBe("⏳ Pilot not started");
  });

  it("waits for enough decisions before judging", () => {
    const s = pilotSummary(input({ startedAt: daysAgo(3), kept: 2, dismissed: 1 }));
    expect(s.verdict.cls).toBe("wait");
    expect(s.verdict.title).toBe("⏳ Pilot running: day 4 of 14");
    expect(s.verdict.body).toContain("so far 3");
  });

  it("says on track mid-pilot and works after two weeks when every target is met", () => {
    expect(pilotSummary(input({ startedAt: daysAgo(9) })).verdict.title).toBe("✅ On track: day 10 of 14");
    const done = pilotSummary(input({}));
    expect(done.verdict.title).toBe("✅ The notebook works");
    expect(done.keepRate).toBeCloseTo(0.8);
    expect(done.actRate).toBeCloseTo(0.7);
  });

  it("does not call a failure before the two weeks are up", () => {
    const mid = pilotSummary(input({ startedAt: daysAgo(5), kept: 3, dismissed: 7 }));
    expect(mid.verdict.cls).toBe("wait");
    expect(mid.verdict.body).toContain("suggestions are mostly not worth keeping");
    const end = pilotSummary(input({ kept: 3, dismissed: 7, reminderSends: 1 }));
    expect(end.verdict.title).toBe("⚠️ Not yet");
    expect(end.verdict.body).toContain("fewer than 3 reminders");
  });

  it("ignored reminders count against the act rate; snoozed and pending don't count at all", () => {
    const s = pilotSummary(
      input({ reminderOutcomes: [...Array(5).fill("acted"), ...Array(5).fill("ignored"), ...Array(9).fill("snoozed"), "pending"] })
    );
    expect(s.actRate).toBe(0.5);
    expect(s.reminderDecided).toBe(10);
  });

  it("a safety failure overrides everything", () => {
    const s = pilotSummary(input({ privateMentionsInAutoSent: 1 }));
    expect(s.verdict.title).toBe("⚠️ Safety check failed");
    expect(s.safeGo).toBe(false);
  });
});

function ready(over: Partial<ReadinessInput>): ReadinessInput {
  return {
    env: { smtpUser: "me@gmail.com", smtpPass: "abcd efgh ijkl mnop", imapHost: "imap.gmail.com", telegramToken: "123:abc", telegramChat: "42" },
    scheduler: { okAt: new Date(NOW.getTime() - 60_000), errorAt: null, error: null },
    emailPoller: { okAt: new Date(NOW.getTime() - 60_000), errorAt: null, error: null },
    lastDraftAt: daysAgo(0.1),
    readyContacts: 2,
    keptNotes: 4,
    now: NOW,
    ...over,
  };
}
const state = (i: ReadinessInput, label: string) => buildReadiness(i).find((c) => c.label === label)!;

describe("readiness", () => {
  it("is all green when everything is set up and running", () => {
    expect(buildReadiness(ready({})).every((c) => c.state === "ok")).toBe(true);
  });

  it("treats values copied from the example settings as not configured", () => {
    expect(isConfigured("you@gmail.com")).toBe(false);
    expect(isConfigured("your-16-char-app-password")).toBe(false);
    expect(isConfigured("")).toBe(false);
    expect(isConfigured("me@gmail.com")).toBe(true);
    expect(state(ready({ env: { smtpUser: "you@gmail.com", smtpPass: "your-16-char-app-password" } }), "Sending email").state).toBe("bad");
  });

  it("flags a stopped background service", () => {
    const c = state(ready({ scheduler: { okAt: daysAgo(1), errorAt: null, error: null } }), "Background service");
    expect(c.state).toBe("bad");
    expect(c.detail).toContain("24 h ago");
    expect(state(ready({ scheduler: null }), "Background service").state).toBe("bad");
  });

  it("shows why reading replies is failing, in plain words", () => {
    const c = state(
      ready({ emailPoller: { okAt: daysAgo(1), errorAt: new Date(NOW.getTime() - 120_000), error: "Sign-in was rejected. Check the email address and app password." } }),
      "Reading replies"
    );
    expect(c.state).toBe("bad");
    expect(c.detail).toBe("Sign-in was rejected. Check the email address and app password. (2 min ago)");
  });

  it("warns when phone notifications, contacts or notes are missing", () => {
    const i = ready({ env: { smtpUser: "me@x.in", smtpPass: "pw-real", imapHost: "imap.x.in" }, readyContacts: 1, keptNotes: 0 });
    expect(state(i, "Phone notifications").state).toBe("warn");
    expect(state(i, "Pilot contacts").detail).toContain("1 of 2–3 ready");
    expect(state(i, "Notebook").state).toBe("warn");
  });

  it("formats how long ago", () => {
    expect(ago(new Date(NOW.getTime() - 20_000), NOW)).toBe("just now");
    expect(ago(daysAgo(3), NOW)).toBe("3 days ago");
  });
});
