import type { Contact, ToneProfile, Message } from "@prisma/client";

type ContactWithTone = Contact & { toneProfile: ToneProfile | null };

/**
 * Builds the system prompt that makes the AI sound like YOU when talking
 * to THIS specific person. The tone profile (your real past messages +
 * style notes) is what makes the output genuine instead of generic.
 */
export function buildVoiceSystemPrompt(contact: ContactWithTone): string {
  const tp = contact.toneProfile;
  const samples = tp?.sampleMessages?.length
    ? tp.sampleMessages.map((m, i) => `${i + 1}. "${m}"`).join("\n")
    : "(no samples yet — keep it warm, short, and natural)";

  return [
    `You are writing messages AS the user (the operator), not as an assistant.`,
    `You are messaging "${contact.name}", who is the user's ${contact.relationship}.`,
    tp?.styleNotes ? `Style notes: ${tp.styleNotes}` : "",
    tp?.languageMix ? `Language: write in ${tp.languageMix}.` : `Language: ${contact.language}.`,
    tp?.doNotSay?.length ? `Never mention: ${tp.doNotSay.join(", ")}.` : "",
    ``,
    `Here are real past messages the user sent ${contact.name}. Match this voice closely`,
    `(length, tone, emojis, nicknames, spelling habits):`,
    samples,
    ``,
    `Rules: sound exactly like the user. Be brief. No signatures, no "as an AI".`,
    `If anything is emotional, sensitive, about money, conflict, or needs a real human`,
    `(e.g. "let's meet", "call me"), reply with the single token: __ESCALATE__`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function greetingUserPrompt(slot: "morning" | "evening" | "festival", festival?: string): string {
  if (slot === "festival" && festival) return `Write a short, warm ${festival} wish.`;
  return slot === "morning" ? `Write a short good-morning check-in.` : `Write a short good-evening message.`;
}

export function replyUserPrompt(history: Message[]): string {
  const convo = history
    .slice(-8)
    .map((m) => `${m.direction === "IN" ? contactLabel() : "You"}: ${m.body}`)
    .join("\n");
  return `Recent conversation:\n${convo}\n\nWrite your next reply.`;
}

function contactLabel() {
  return "Them";
}
