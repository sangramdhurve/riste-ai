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
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME ?? "Riste"}" <${process.env.SMTP_USER}>`,
      to,
      subject: opts?.subject ?? "Hi 👋",
      text: body,
    });
    return { externalId: info.messageId };
  },
};
