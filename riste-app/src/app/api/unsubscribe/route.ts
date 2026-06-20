import { prisma } from "@/lib/db";

/**
 * One-click unsubscribe target for the email List-Unsubscribe header / footer.
 * GET ?c=<channelId> permanently opts the recipient out. Returns a tiny HTML
 * confirmation. Also accepts POST for List-Unsubscribe-Post=One-Click.
 */
async function optOut(channelId: string | null): Promise<boolean> {
  if (!channelId) return false;
  try {
    await prisma.contactChannel.update({
      where: { id: channelId },
      data: { consentStatus: "REVOKED", optedOutAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

function page(ok: boolean): Response {
  const msg = ok
    ? "You've been unsubscribed. You won't receive any more messages."
    : "We couldn't process that unsubscribe link.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribe</title>` +
      `<body style="font-family:system-ui;max-width:480px;margin:64px auto;padding:0 16px;color:#222">` +
      `<h2>Riste</h2><p>${msg}</p></body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get("c");
  return page(await optOut(c));
}

export async function POST(req: Request) {
  const c = new URL(req.url).searchParams.get("c");
  return page(await optOut(c));
}
