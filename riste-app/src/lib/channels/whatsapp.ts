import type { Channel, SendResult } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

function api(path: string) {
  return `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/${path}`;
}
function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  };
}

/**
 * WhatsApp via Meta's official Cloud API.
 *
 * IMPORTANT: WhatsApp only allows free-form text to a user within 24h of THEIR
 * last message (the "customer service window"). So:
 *   - send()         -> free-form text. Use for REPLIES (inside the 24h window).
 *   - sendTemplate() -> a pre-approved template. REQUIRED for proactive greetings
 *                       (good morning / festival wishes), which are paid.
 */
export const whatsappChannel: Channel = {
  type: "WHATSAPP",
  async send(to: string, body: string): Promise<SendResult> {
    if (!process.env.WHATSAPP_TOKEN) throw new Error("WHATSAPP_TOKEN not set");
    const res = await fetch(api("messages"), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { messages?: { id?: string }[] };
    return { externalId: data.messages?.[0]?.id };
  },
};

/**
 * Send an approved template (for proactive, business-initiated messages).
 * `components` carries any body variables your template defines.
 */
export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode = "en",
  components: unknown[] = []
): Promise<SendResult> {
  const res = await fetch(api("messages"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp template error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id?: string }[] };
  return { externalId: data.messages?.[0]?.id };
}
