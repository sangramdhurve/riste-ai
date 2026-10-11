/**
 * "Is everything a pilot needs actually working?" as plain-language checks.
 * Pure: the metrics page gathers the inputs. Labels describe what each piece
 * does for the user, never what it is built with.
 */

export type CheckState = "ok" | "warn" | "bad";
export type Check = { label: string; state: CheckState; detail: string };

type Beat = { okAt: Date | null; errorAt: Date | null; error: string | null } | null;

export type ReadinessInput = {
  env: { smtpUser?: string; smtpPass?: string; imapHost?: string; telegramToken?: string; telegramChat?: string };
  scheduler: Beat;
  emailPoller: Beat;
  lastDraftAt: Date | null;
  readyContacts: number;
  keptNotes: number;
  now: Date;
};

export const SCHEDULER_STALE_MIN = 3; // it ticks every minute
export const POLLER_STALE_MIN = 5;
export const PILOT_CONTACTS = 2;
export const MIN_SAMPLES = 3;

// Values copied from the example settings file are not real configuration.
const PLACEHOLDER = /^$|^you@|your-|change-me|example\.com$/i;
export function isConfigured(v: string | undefined): boolean {
  return !!v && !PLACEHOLDER.test(v.trim());
}

export function ago(d: Date, now: Date): string {
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const minutesSince = (d: Date, now: Date) => (now.getTime() - d.getTime()) / 60_000;

export function buildReadiness(i: ReadinessInput): Check[] {
  const { env, now } = i;
  const checks: Check[] = [];

  const s = i.scheduler?.okAt;
  checks.push(
    !s
      ? { label: "Background service", state: "bad", detail: "Never seen running. Start the background service: without it nothing is scheduled, drafted or reminded." }
      : minutesSince(s, now) > SCHEDULER_STALE_MIN
        ? { label: "Background service", state: "bad", detail: `Stopped: last seen ${ago(s, now)}. Start it again.` }
        : { label: "Background service", state: "ok", detail: `Running (last seen ${ago(s, now)})` }
  );

  const emailSet = isConfigured(env.smtpUser) && isConfigured(env.smtpPass);
  checks.push(
    emailSet
      ? { label: "Sending email", state: "ok", detail: "Set up" }
      : { label: "Sending email", state: "bad", detail: "Not set up: add your email address and app password to the settings file." }
  );

  const p = i.emailPoller;
  const failing = p?.errorAt && (!p.okAt || p.errorAt > p.okAt);
  checks.push(
    !env.imapHost
      ? { label: "Reading replies", state: "warn", detail: "Off: email replies won't be picked up." }
      : failing
        ? { label: "Reading replies", state: "bad", detail: `${p!.error ?? "Failing."} (${ago(p!.errorAt!, now)})` }
        : p?.okAt && minutesSince(p.okAt, now) <= POLLER_STALE_MIN
          ? { label: "Reading replies", state: "ok", detail: `Checked your inbox ${ago(p.okAt, now)}` }
          : { label: "Reading replies", state: "warn", detail: p?.okAt ? `Last checked ${ago(p.okAt, now)}` : "Not checked yet" }
  );

  checks.push(
    isConfigured(env.telegramToken) && isConfigured(env.telegramChat)
      ? { label: "Phone notifications", state: "ok", detail: "Telegram set up: approvals and reminders reach your phone" }
      : { label: "Phone notifications", state: "warn", detail: "Not set up: approvals and reminders only show here on the dashboard." }
  );

  checks.push(
    i.lastDraftAt
      ? { label: "Drafting", state: minutesSince(i.lastDraftAt, now) <= 48 * 60 ? "ok" : "warn", detail: `Last draft written ${ago(i.lastDraftAt, now)}` }
      : { label: "Drafting", state: "warn", detail: "No drafts yet" }
  );

  checks.push(
    i.readyContacts >= PILOT_CONTACTS
      ? { label: "Pilot contacts", state: "ok", detail: `${i.readyContacts} ready` }
      : {
          label: "Pilot contacts",
          state: "warn",
          detail: `${i.readyContacts} of 2–3 ready. Each needs consent on a channel and at least ${MIN_SAMPLES} of your past messages to them.`,
        }
  );

  checks.push(
    i.keptNotes > 0
      ? { label: "Notebook", state: "ok", detail: `${i.keptNotes} note${i.keptNotes === 1 ? "" : "s"} kept` }
      : { label: "Notebook", state: "warn", detail: "Empty: add a few notes, or keep some of Riste's suggestions." }
  );

  return checks;
}
