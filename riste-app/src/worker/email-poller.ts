import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { prisma } from "@/lib/db";
import { risteQueue } from "@/lib/queue";
import { recordInboundReply } from "@/lib/analytics";
import { isOptOut } from "@/lib/optout";
import { recordAudit } from "@/lib/audit";
import { beatError, beatOk } from "@/lib/heartbeat";

/**
 * Gmail IMAP reply reader. Every minute it checks INBOX for unseen mail, and
 * for each message whose sender matches a contact's email, it stores an inbound
 * message and enqueues an inbound job (so the AI drafts a reply).
 *
 * It only marks a message \Seen when it matched a contact, so it never touches
 * the rest of your inbox.
 */
export function startEmailPoller() {
  if (!process.env.IMAP_HOST) {
    console.log("[email-poller] IMAP_HOST not set — skipping");
    return;
  }

  const poll = async () => {
    const client = new ImapFlow({
      host: process.env.IMAP_HOST!,
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: true,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      logger: false,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const unseen = (await client.search({ seen: false })) || [];
        for (const seq of unseen) {
          const fetched = await client.fetchOne(String(seq), { source: true });
          if (!fetched || !fetched.source) continue;

          const parsed = await simpleParser(fetched.source);
          const from = parsed.from?.value?.[0]?.address?.toLowerCase();
          const body = (parsed.text ?? "").trim();
          if (!from || !body) continue;

          const ch = await prisma.contactChannel.findFirst({
            where: { type: "EMAIL", value: { equals: from, mode: "insensitive" } },
          });
          if (!ch) continue; // not a contact — leave it untouched/unread

          if (parsed.messageId) {
            const seen = await prisma.message.findFirst({ where: { externalId: parsed.messageId } });
            if (seen) {
              await client.messageFlagsAdd(String(seq), ["\\Seen"]);
              continue;
            }
          }

          const msg = await prisma.message.create({
            data: {
              contactId: ch.contactId,
              channel: "EMAIL",
              direction: "IN",
              body,
              status: "DELIVERED",
              externalId: parsed.messageId ?? null,
            },
          });
          recordAudit({ contactId: ch.contactId, channel: "EMAIL", direction: "IN", body, externalId: parsed.messageId });

          // Honour opt-out replies (e.g. "unsubscribe"): flip consent, skip reply.
          if (isOptOut(body)) {
            await prisma.contactChannel.update({
              where: { id: ch.id },
              data: { consentStatus: "REVOKED", optedOutAt: new Date() },
            });
            await client.messageFlagsAdd(String(seq), ["\\Seen"]);
            continue;
          }

          await risteQueue.add("inbound", { type: "inbound", messageId: msg.id });
          await recordInboundReply(ch.contactId, "EMAIL");
          await client.messageFlagsAdd(String(seq), ["\\Seen"]);
          console.log(`[email-poller] inbound from ${from} -> contact ${ch.contactId}`);
        }
      } finally {
        lock.release();
      }
      beatOk("email-poller");
    } catch (err) {
      console.error("[email-poller] error:", err);
      beatError(
        "email-poller",
        (err as { authenticationFailed?: boolean })?.authenticationFailed
          ? "Sign-in was rejected. Check the email address and app password."
          : "Couldn't reach the mailbox."
      );
    } finally {
      try {
        await client.logout();
      } catch {
        /* ignore */
      }
    }
  };

  poll();
  setInterval(poll, 60_000);
  console.log("[email-poller] started (60s poll)");
}
