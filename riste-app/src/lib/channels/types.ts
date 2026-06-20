import type { ChannelType } from "@prisma/client";

export type SendResult = { externalId?: string };

/**
 * Every channel (email, SMS, WhatsApp) implements this one interface.
 * The AI and scheduler never know which channel they're using — adding a
 * new channel never touches the brain.
 */
export interface Channel {
  type: ChannelType;
  send(
    to: string,
    body: string,
    opts?: { subject?: string; unsubscribeUrl?: string }
  ): Promise<SendResult>;
}
