import { describe, it, expect } from "vitest";
import { parseSettingsInput } from "@/lib/settings-input";

const current = { aiDisclosure: false, disclosureText: "" };

describe("parseSettingsInput", () => {
  it("accepts a full, valid settings form", () => {
    const r = parseSettingsInput(
      {
        quietHoursStart: "22:30",
        quietHoursEnd: "07:00",
        maxPerContactPerDay: 3,
        requireConsent: true,
        defaultAutonomy: "AUTO_GREETINGS",
        reminderTime: "09:30",
        aiDisclosure: true,
        disclosureText: "  (sent with a little help)  ",
      },
      current
    );
    expect(r).toEqual({
      ok: true,
      data: {
        quietHoursStart: "22:30",
        quietHoursEnd: "07:00",
        maxPerContactPerDay: 3,
        requireConsent: true,
        defaultAutonomy: "AUTO_GREETINGS",
        reminderTime: "09:30",
        aiDisclosure: true,
        disclosureText: "(sent with a little help)",
      },
    });
  });

  it("changes only the fields that were sent", () => {
    expect(parseSettingsInput({ killSwitch: true }, current)).toEqual({ ok: true, data: { killSwitch: true } });
  });

  it("rejects bad times, limits, booleans and autonomy values", () => {
    for (const bad of [
      { quietHoursStart: "24:00" },
      { reminderTime: "9:30" },
      { maxPerContactPerDay: 0 },
      { maxPerContactPerDay: 11 },
      { maxPerContactPerDay: 2.5 },
      { requireConsent: "no" },
      { defaultAutonomy: "YOLO" },
      { disclosureText: "x".repeat(121) },
    ]) {
      expect(parseSettingsInput(bad, current).ok, JSON.stringify(bad)).toBe(false);
    }
    expect(parseSettingsInput(null, current).ok).toBe(false);
  });

  it("won't turn the disclosure on without a line to add", () => {
    expect(parseSettingsInput({ aiDisclosure: true }, current)).toEqual({
      ok: false,
      error: "add the line to append before turning this on",
    });
    // ...but it's fine if a line is already saved
    expect(parseSettingsInput({ aiDisclosure: true }, { aiDisclosure: false, disclosureText: "(with help)" }).ok).toBe(true);
    // ...and clearing the line while it's on is refused
    expect(parseSettingsInput({ disclosureText: "" }, { aiDisclosure: true, disclosureText: "(with help)" }).ok).toBe(false);
  });
});
