import { describe, it, expect } from "vitest";
import { checkGuards } from "@/lib/guardrails";

// Sensible baseline: consent granted, outside quiet hours, under the rate cap.
const base = {
  killSwitch: false,
  requireConsent: true,
  consentStatus: "GRANTED" as const,
  optedOutAt: null as Date | null,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  nowHHMM: "12:00",
  sentLast24h: 0,
  maxPerContactPerDay: 2,
  manual: false,
};

describe("checkGuards", () => {
  it("allows a normal, consented, in-window send", () => {
    expect(checkGuards(base)).toEqual({ ok: true });
  });

  it("blocks when the kill switch is on — even for manual sends", () => {
    expect(checkGuards({ ...base, killSwitch: true })).toEqual({ ok: false, reason: "kill_switch" });
    expect(checkGuards({ ...base, killSwitch: true, manual: true })).toEqual({
      ok: false,
      reason: "kill_switch",
    });
  });

  it("blocks an opted-out recipient — even for manual sends", () => {
    const optedOut = { ...base, optedOutAt: new Date(), manual: true };
    expect(checkGuards(optedOut)).toEqual({ ok: false, reason: "opted_out" });
  });

  it("blocks when consent is not GRANTED and consent is required", () => {
    for (const consentStatus of ["UNKNOWN", "PENDING", "REVOKED"] as const) {
      expect(checkGuards({ ...base, consentStatus })).toEqual({ ok: false, reason: "no_consent" });
      // Even a manual approval cannot override missing consent.
      expect(checkGuards({ ...base, consentStatus, manual: true })).toEqual({
        ok: false,
        reason: "no_consent",
      });
    }
  });

  it("allows non-consented sends only when requireConsent is off", () => {
    expect(checkGuards({ ...base, requireConsent: false, consentStatus: "UNKNOWN" })).toEqual({
      ok: true,
    });
  });

  it("blocks during quiet hours for auto sends, but a manual approval overrides", () => {
    const night = { ...base, nowHHMM: "23:30" };
    expect(checkGuards(night)).toEqual({ ok: false, reason: "quiet_hours" });
    expect(checkGuards({ ...night, manual: true })).toEqual({ ok: true });
  });

  it("blocks once the daily rate cap is hit for auto sends, but manual overrides", () => {
    const capped = { ...base, sentLast24h: 2, maxPerContactPerDay: 2 };
    expect(checkGuards(capped)).toEqual({ ok: false, reason: "rate_limit" });
    expect(checkGuards({ ...capped, manual: true })).toEqual({ ok: true });
  });

  it("orders hard stops before courtesy limits (opt-out wins over quiet hours)", () => {
    const both = { ...base, optedOutAt: new Date(), nowHHMM: "23:30" };
    expect(checkGuards(both)).toEqual({ ok: false, reason: "opted_out" });
  });
});
