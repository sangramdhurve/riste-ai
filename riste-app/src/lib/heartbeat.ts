import { prisma } from "@/lib/db";

/**
 * Background loops report in here so the dashboard can tell the operator that
 * something stopped working, instead of a pilot quietly producing nothing.
 * Fire-and-forget: recording health must never break the loop itself.
 */
export type HeartbeatKey = "scheduler" | "email-poller";

export function beatOk(key: HeartbeatKey): void {
  const now = new Date();
  prisma.heartbeat
    .upsert({ where: { key }, create: { key, okAt: now }, update: { okAt: now } })
    .catch((e) => console.error(`[heartbeat] ${key}:`, e));
}

/** `summary` is shown to the operator as-is: plain words, no raw error text. */
export function beatError(key: HeartbeatKey, summary: string): void {
  const now = new Date();
  prisma.heartbeat
    .upsert({ where: { key }, create: { key, errorAt: now, error: summary }, update: { errorAt: now, error: summary } })
    .catch((e) => console.error(`[heartbeat] ${key}:`, e));
}
