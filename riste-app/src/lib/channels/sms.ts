import type { Channel, SendResult } from "./types";

/**
 * SMS via the open-source android-sms-gateway running on YOUR phone
 * (https://github.com/capcom6/android-sms-gateway). Messages go out from your
 * real SIM/number — free beyond your normal plan.
 *
 * Local mode: the app exposes POST {SMS_GATEWAY_URL}/message with Basic auth.
 * Body: { message, phoneNumbers: ["+91..."] }.
 */
export const smsChannel: Channel = {
  type: "SMS",
  async send(to: string, body: string): Promise<SendResult> {
    const url = process.env.SMS_GATEWAY_URL;
    if (!url) throw new Error("SMS_GATEWAY_URL not set");

    const auth = Buffer.from(
      `${process.env.SMS_GATEWAY_USERNAME ?? ""}:${process.env.SMS_GATEWAY_PASSWORD ?? ""}`
    ).toString("base64");

    const res = await fetch(`${url.replace(/\/$/, "")}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ message: body, phoneNumbers: [to] }),
    });

    if (!res.ok) throw new Error(`SMS gateway error ${res.status}: ${await res.text()}`);
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { externalId: data.id };
  },
};
