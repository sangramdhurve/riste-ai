import type { ChannelType, ConsentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { localHHMM, inQuietHours } from "@/lib/time";

export type GuardReason =
  | "kill_switch"
  | "opted_out"
  | "no_consent"
  | "quiet_hours"
  | "rate_limit";

export type GuardResult = { ok: true } | { ok: false; reason: GuardReason };

/**
 * Pure send-gate. Given everything as plain data, decide whether a message may
 * go out. Order matters: hard, always-on legal stops (kill switch, opt-out,
 * consent) come first and apply even to manual approvals. Courtesy limits
 * (quiet hours, rate cap) apply only to automatic sends — when YOU explicitly
 * tap approve, you're allowed to override them.
 */
export function checkGuards(args: {
  killSwitch: boolean;
  requireConsent: boolean;
  consentStatus: ConsentStatus;
  optedOutAt: Date | null;
  quietHoursStart: string;
  quietHoursEnd: string;
  nowHHMM: string;
  sentLast24h: number;
  maxPerContactPerDay: number;
  manual: boolean;
}): GuardResult {
  if (args.killSwitch) return { ok: false, reason: "kill_switch" };
  if (args.optedOutAt) return { ok: false, reason: "opted_out" };
  if (args.requireConsent && args.consentStatus !== "GRANTED") {
    return { ok: false, reason: "no_consent" };
  }
  if (!args.manual) {
    if (inQuietHours(args.nowHHMM, args.quietHoursStart, args.quietHoursEnd)) {
      return { ok: false, reason: "quiet_hours" };
    }
    if (args.sentLast24h >= args.maxPerContactPerDay) {
      return { ok: false, reason: "rate_limit" };
    }
  }
  return { ok: true };
}

/**
 * IO wrapper around checkGuards: loads the global Setting and the rolling-24h
 * send count, then defers the actual decision to the pure function above.
 */
export async function canSend(args: {
  contactId: string;
  timezone: string;
  channel: ChannelType;
  consentStatus: ConsentStatus;
  optedOutAt: Date | null;
  manual: boolean;
  now?: Date;
}): Promise<GuardResult> {
  const setting = await getSetting();
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - 24 * 3600 * 1000);

  const sentLast24h = await prisma.message.count({
    where: {
      contactId: args.contactId,
      channel: args.channel,
      direction: "OUT",
      status: { in: ["SENT", "DELIVERED", "READ"] },
      sentAt: { gte: since },
    },
  });

  return checkGuards({
    killSwitch: setting.killSwitch,
    requireConsent: setting.requireConsent,
    consentStatus: args.consentStatus,
    optedOutAt: args.optedOutAt,
    quietHoursStart: setting.quietHoursStart,
    quietHoursEnd: setting.quietHoursEnd,
    nowHHMM: localHHMM(args.timezone, now),
    sentLast24h,
    maxPerContactPerDay: setting.maxPerContactPerDay,
    manual: args.manual,
  });
}
