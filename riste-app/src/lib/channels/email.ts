import nodemailer from "nodemailer";
import type { Channel, SendResult } from "./types";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: Number(process.env.SMTP_PORT ?? 465) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export const emailChannel: Channel = {
  type: "EMAIL",
  async send(to: string, body: string, opts): Promise<SendResult> {
    // Give every email a one-click way out, both as a visible footer and the
    // standard List-Unsubscribe header mail clients honour.
    const footer = opts?.unsubscribeUrl
      ? `\n\n—\nTo stop these messages: ${opts.unsubscribeUrl}`
      : "";
    const headers = opts?.unsubscribeUrl
      ? { "List-Unsubscribe": `<${opts.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined;

    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME ?? "Riste"}" <${process.env.SMTP_USER}>`,
      to,
      subject: opts?.subject ?? "Hi 👋",
      text: body + footer,
      headers,
    });
    return { externalId: info.messageId };
  },
};
