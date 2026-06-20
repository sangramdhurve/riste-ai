import { describe, it, expect } from "vitest";
import { isOptOut } from "@/lib/optout";

describe("isOptOut", () => {
  it("detects plain STOP keywords (any case, trailing punctuation)", () => {
    for (const t of ["STOP", "stop", "Stop.", "stop!", "  UNSUBSCRIBE  ", "cancel", "quit"]) {
      expect(isOptOut(t)).toBe(true);
    }
  });

  it("detects Hindi opt-outs (romanized + Devanagari)", () => {
    for (const t of ["band karo", "Band Karo", "बंद करो", "रोको"]) {
      expect(isOptOut(t)).toBe(true);
    }
  });

  it("treats a leading keyword as opt-out (safer to over-honour)", () => {
    expect(isOptOut("stop please")).toBe(true);
    expect(isOptOut("unsubscribe me from this")).toBe(true);
  });

  it("does not opt out normal conversation", () => {
    for (const t of ["hey what's up", "I won't stop loving you", "let's catch up", "", "  "]) {
      expect(isOptOut(t)).toBe(false);
    }
  });

  it("handles null/undefined safely", () => {
    expect(isOptOut(null)).toBe(false);
    expect(isOptOut(undefined)).toBe(false);
  });
});
