import { describe, it, expect } from "vitest";
import { decideSend } from "@/lib/autonomy";

describe("decideSend — autonomy gating", () => {
  it("SUPERVISED holds everything for approval", () => {
    expect(decideSend({ autonomy: "SUPERVISED", kind: "greeting", escalate: false })).toEqual({
      autoSend: false,
      status: "AWAITING_APPROVAL",
    });
    expect(
      decideSend({ autonomy: "SUPERVISED", kind: "reply", escalate: false, confidence: 0.95 })
    ).toEqual({ autoSend: false, status: "AWAITING_APPROVAL" });
  });

  it("AUTO_GREETINGS auto-sends greetings but holds replies", () => {
    expect(decideSend({ autonomy: "AUTO_GREETINGS", kind: "greeting", escalate: false })).toEqual({
      autoSend: true,
      status: "QUEUED",
    });
    expect(
      decideSend({ autonomy: "AUTO_GREETINGS", kind: "reply", escalate: false, confidence: 0.95 })
    ).toEqual({ autoSend: false, status: "AWAITING_APPROVAL" });
  });

  it("FULL_AUTO auto-sends a reply only when confident enough", () => {
    expect(
      decideSend({ autonomy: "FULL_AUTO", kind: "reply", escalate: false, confidence: 0.8 })
    ).toEqual({ autoSend: true, status: "QUEUED" });
    expect(
      decideSend({ autonomy: "FULL_AUTO", kind: "reply", escalate: false, confidence: 0.3 })
    ).toEqual({ autoSend: false, status: "AWAITING_APPROVAL" });
  });

  it("treats the confidence threshold as inclusive (0.6 passes)", () => {
    expect(
      decideSend({ autonomy: "FULL_AUTO", kind: "reply", escalate: false, confidence: 0.6 }).autoSend
    ).toBe(true);
  });
});

describe("decideSend — escalation routing", () => {
  it("an escalation always HOLDS, regardless of autonomy level", () => {
    for (const autonomy of ["SUPERVISED", "AUTO_GREETINGS", "FULL_AUTO"] as const) {
      expect(decideSend({ autonomy, kind: "greeting", escalate: true })).toEqual({
        autoSend: false,
        status: "HELD",
      });
      expect(
        decideSend({ autonomy, kind: "reply", escalate: true, confidence: 0.99 })
      ).toEqual({ autoSend: false, status: "HELD" });
    }
  });
});
