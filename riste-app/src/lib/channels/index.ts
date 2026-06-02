import type { ChannelType } from "@prisma/client";
import type { Channel } from "./types";
import { emailChannel } from "./email";
import { smsChannel } from "./sms";
import { whatsappChannel } from "./whatsapp";

// Each channel just registers here; the rest of the app stays unchanged.
const channels: Partial<Record<ChannelType, Channel>> = {
  EMAIL: emailChannel,
  SMS: smsChannel,
  WHATSAPP: whatsappChannel,
};

export function getChannel(type: ChannelType): Channel {
  const c = channels[type];
  if (!c) throw new Error(`Channel ${type} not implemented yet`);
  return c;
}
