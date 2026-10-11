/**
 * Deterministic queue job ids, so re-adding "the same" job (every scheduler
 * tick, a worker restart) is a no-op instead of a duplicate send. The queue
 * rejects custom ids containing ":" (and pure integers), so parts are joined
 * with "|" and any ":" inside a part (e.g. a festival name) is replaced.
 */
export function jobId(...parts: (string | number | null | undefined)[]): string {
  return parts.map((p) => String(p ?? "").replace(/:/g, "-")).join("|");
}
