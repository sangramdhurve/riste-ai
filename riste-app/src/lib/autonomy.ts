import type { Autonomy, MessageStatus } from "@prisma/client";

/**
 * The human-in-the-loop contract, as one pure function so it can be tested
 * without a database or the AI engine.
 *
 *  - SUPERVISED    : nothing auto-sends; everything waits for your tap.
 *  - AUTO_GREETINGS: greetings auto-send; replies still wait.
 *  - FULL_AUTO     : replies auto-send only when the AI is confident AND didn't escalate.
 *
 * An escalation (__ESCALATE__) ALWAYS holds the message for a human, regardless
 * of autonomy level.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

export type SendDecision = { autoSend: boolean; status: MessageStatus };

export function decideSend(args: {
  autonomy: Autonomy;
  kind: "greeting" | "reply";
  escalate: boolean;
  confidence?: number;
}): SendDecision {
  const { autonomy, kind, escalate, confidence } = args;

  let autoSend: boolean;
  if (escalate) {
    autoSend = false; // escalation always wins — hold for a human
  } else if (kind === "greeting") {
    autoSend = autonomy !== "SUPERVISED";
  } else {
    autoSend = autonomy === "FULL_AUTO" && (confidence ?? 0) >= CONFIDENCE_THRESHOLD;
  }

  const status: MessageStatus = autoSend ? "QUEUED" : escalate ? "HELD" : "AWAITING_APPROVAL";
  return { autoSend, status };
}
