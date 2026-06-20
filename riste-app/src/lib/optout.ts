/**
 * Detect an opt-out ("STOP") reply. Recipients must always be able to make us
 * stop with a single word — a legal requirement (TCPA / carrier rules) and the
 * baseline of not being creepy. Covers English plus Hindi (Devanagari + romanized)
 * for the India-first audience.
 */
const OPT_OUT_KEYWORDS = [
  "stop",
  "stopall",
  "unsubscribe",
  "unsub",
  "cancel",
  "quit",
  "end",
  "optout",
  "opt-out",
  "remove me",
  "band karo",
  "band kar",
  "mat bhejo",
  "बंद करो",
  "बंद",
  "रोको",
];

export function isOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  // Strip punctuation/whitespace at the edges and lowercase.
  const t = text.trim().toLowerCase().replace(/[!.।]+$/u, "").trim();
  if (!t) return false;
  return OPT_OUT_KEYWORDS.some((k) => t === k || t.startsWith(k + " "));
}
