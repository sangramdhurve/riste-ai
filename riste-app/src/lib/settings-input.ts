import type { Autonomy } from "@prisma/client";

/**
 * Validation for the Settings page. Pure: takes the request body and the
 * current settings (needed for rules that span fields) and returns only the
 * fields to change.
 */
export type SettingsFields = {
  killSwitch?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxPerContactPerDay?: number;
  requireConsent?: boolean;
  defaultAutonomy?: Autonomy;
  reminderTime?: string;
  aiDisclosure?: boolean;
  disclosureText?: string;
};

export type CurrentSettings = { aiDisclosure: boolean; disclosureText: string };

export const MAX_DAILY_LIMIT = 10;
export const MAX_DISCLOSURE_LENGTH = 120;
const AUTONOMY: Autonomy[] = ["SUPERVISED", "AUTO_GREETINGS", "FULL_AUTO"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type Result = { ok: true; data: SettingsFields } | { ok: false; error: string };

export function parseSettingsInput(b: unknown, current: CurrentSettings): Result {
  if (!b || typeof b !== "object") return { ok: false, error: "invalid body" };
  const body = b as Record<string, unknown>;
  const data: SettingsFields = {};

  for (const key of ["killSwitch", "requireConsent", "aiDisclosure"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") return { ok: false, error: `${key} must be true or false` };
    data[key] = body[key] as boolean;
  }

  for (const key of ["quietHoursStart", "quietHoursEnd", "reminderTime"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "string" || !HHMM.test(body[key] as string)) {
      return { ok: false, error: "times must be HH:MM (24-hour)" };
    }
    data[key] = body[key] as string;
  }

  if (body.maxPerContactPerDay !== undefined) {
    const n = body.maxPerContactPerDay;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_DAILY_LIMIT) {
      return { ok: false, error: `the daily limit must be a whole number from 1 to ${MAX_DAILY_LIMIT}` };
    }
    data.maxPerContactPerDay = n;
  }

  if (body.defaultAutonomy !== undefined) {
    if (!AUTONOMY.includes(body.defaultAutonomy as Autonomy)) return { ok: false, error: "invalid default for new contacts" };
    data.defaultAutonomy = body.defaultAutonomy as Autonomy;
  }

  if (body.disclosureText !== undefined) {
    if (typeof body.disclosureText !== "string") return { ok: false, error: "invalid disclosure text" };
    const t = body.disclosureText.trim();
    if (t.length > MAX_DISCLOSURE_LENGTH) {
      return { ok: false, error: `the disclosure line can be at most ${MAX_DISCLOSURE_LENGTH} characters` };
    }
    data.disclosureText = t;
  }

  // Turning the disclosure on with nothing to append would silently do nothing.
  const disclosureOn = data.aiDisclosure ?? current.aiDisclosure;
  const text = data.disclosureText ?? current.disclosureText;
  if (disclosureOn && !text) return { ok: false, error: "add the line to append before turning this on" };

  return { ok: true, data };
}
