import { describe, it, expect } from "vitest";
import { inQuietHours, localHHMM } from "@/lib/time";

describe("inQuietHours — window that wraps midnight (22:00 → 07:00)", () => {
  const start = "22:00";
  const end = "07:00";
  it("is quiet late at night and early morning", () => {
    expect(inQuietHours("22:00", start, end)).toBe(true);
    expect(inQuietHours("23:30", start, end)).toBe(true);
    expect(inQuietHours("00:00", start, end)).toBe(true);
    expect(inQuietHours("06:59", start, end)).toBe(true);
  });
  it("is not quiet during the day", () => {
    expect(inQuietHours("07:00", start, end)).toBe(false); // end is exclusive
    expect(inQuietHours("12:00", start, end)).toBe(false);
    expect(inQuietHours("21:59", start, end)).toBe(false);
  });
});

describe("inQuietHours — same-day window (09:00 → 17:00)", () => {
  it("is quiet inside the window, open outside", () => {
    expect(inQuietHours("12:00", "09:00", "17:00")).toBe(true);
    expect(inQuietHours("09:00", "09:00", "17:00")).toBe(true);
    expect(inQuietHours("17:00", "09:00", "17:00")).toBe(false);
    expect(inQuietHours("08:59", "09:00", "17:00")).toBe(false);
  });
});

describe("inQuietHours — empty window", () => {
  it("never counts as quiet when start === end or unset", () => {
    expect(inQuietHours("12:00", "08:00", "08:00")).toBe(false);
    expect(inQuietHours("12:00", "", "")).toBe(false);
  });
});

describe("localHHMM", () => {
  it("converts a fixed UTC instant into the target timezone", () => {
    const noonUtc = new Date("2026-06-20T12:00:00Z");
    expect(localHHMM("Asia/Kolkata", noonUtc)).toBe("17:30"); // UTC+5:30
    expect(localHHMM("UTC", noonUtc)).toBe("12:00");
  });
});
