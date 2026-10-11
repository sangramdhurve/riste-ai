import { prisma } from "@/lib/db";
import {
  pilotSummary,
  reminderOutcome,
  mentionsPrivateNote,
  KEEP_TARGET,
  ACT_TARGET,
  REMINDER_SENDS_TARGET,
} from "@/lib/notes/pilot";
import { buildReadiness, MIN_SAMPLES, type CheckState } from "@/lib/readiness";
import { getSetting } from "@/lib/settings";
import PilotControls from "../_components/PilotControls";

export const dynamic = "force-dynamic";

// --- Phase 1 kill/go thresholds (see the launch plan) ---
const VERBATIM_TARGET = 0.5; // >50% of approved drafts sent unchanged → voice capture works
const APPROVAL_TARGET = 0.6; // >60% of decisions are approvals → drafts are usable
const MIN_DECISIONS = 10; // below this, the sample is too small to judge

function pct(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}
const fmtPct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

function Stat({
  num,
  label,
  target,
  state,
}: {
  num: string;
  label: string;
  target?: string;
  state?: "go" | "no";
}) {
  return (
    <div className={`stat ${state ?? ""}`}>
      <div className={`num ${state ?? ""}`}>{num}</div>
      <div className="label">{label}</div>
      {target && <div className="target">{target}</div>}
    </div>
  );
}

const SENT = ["SENT", "DELIVERED", "READ"] as const;
const CHECK_ICON: Record<CheckState, string> = { ok: "✅", warn: "⚠️", bad: "❌" };

// Everything counted from the pilot's start only, so earlier testing never skews it.
async function loadPilot(start: Date | null, now: Date) {
  const since = { gte: start ?? now };
  const [pendingSuggestions, kept, dismissed, reminders, reminderMsgs, autoSentEvents] = await Promise.all([
    prisma.note.count({ where: { status: "PROPOSED" } }),
    prisma.event.count({ where: { type: "note_kept", createdAt: since } }),
    prisma.event.count({ where: { type: "note_dismissed", createdAt: since } }),
    prisma.reminder.findMany({ where: { createdAt: since }, select: { status: true, createdAt: true } }),
    prisma.message.findMany({
      where: { reminderId: { not: null }, status: { in: [...SENT] }, createdAt: since },
      select: { replyReceivedAt: true },
    }),
    prisma.event.findMany({
      where: { type: "auto_sent", messageId: { not: null }, createdAt: since },
      select: { messageId: true },
    }),
  ]);

  // Safety: did anything sent WITHOUT approval mention one of that contact's private notes?
  const autoSent = await prisma.message.findMany({
    where: { id: { in: autoSentEvents.map((e) => e.messageId!) }, status: { in: [...SENT] } },
    select: { body: true, contactId: true },
  });
  const privateNotes = autoSent.length
    ? await prisma.note.findMany({
        where: { sensitive: true, contactId: { in: [...new Set(autoSent.map((m) => m.contactId))] } },
        select: { contactId: true, text: true },
      })
    : [];
  const privateMentions = autoSent.filter((m) =>
    mentionsPrivateNote(m.body, privateNotes.filter((n) => n.contactId === m.contactId).map((n) => n.text))
  ).length;

  const reminderSends = reminderMsgs.length;
  return {
    summary: pilotSummary({
      kept,
      dismissed,
      pendingSuggestions,
      reminderOutcomes: reminders.map((r) => reminderOutcome(r.status, r.createdAt, now)),
      reminderSends,
      reminderSendsReplied: reminderMsgs.filter((m) => m.replyReceivedAt).length,
      privateMentionsInAutoSent: privateMentions,
      startedAt: start,
      now,
    }),
    pendingSuggestions,
    reminderSends,
    reminderSendsReplied: reminderMsgs.filter((m) => m.replyReceivedAt).length,
    privateMentions,
    kept,
  };
}

async function loadReadiness(now: Date) {
  const [beats, lastDraft, contacts, keptNotes] = await Promise.all([
    prisma.heartbeat.findMany(),
    prisma.event.findFirst({ where: { type: "draft_created" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.contact.findMany({ where: { active: true }, include: { channels: true, toneProfile: true } }),
    prisma.note.count({ where: { status: { in: ["ACTIVE", "DONE"] } } }),
  ]);
  const beat = (key: string) => beats.find((b) => b.key === key) ?? null;
  const readyContacts = contacts.filter(
    (c) =>
      c.channels.some((ch) => ch.consentStatus === "GRANTED" && !ch.optedOutAt) &&
      (c.toneProfile?.sampleMessages.length ?? 0) >= MIN_SAMPLES
  ).length;
  return buildReadiness({
    env: {
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      imapHost: process.env.IMAP_HOST,
      telegramToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChat: process.env.TELEGRAM_CHAT_ID,
    },
    scheduler: beat("scheduler"),
    emailPoller: beat("email-poller"),
    lastDraftAt: lastDraft?.createdAt ?? null,
    readyContacts,
    keptNotes,
    now,
  });
}

export default async function Metrics() {
  const grouped = await prisma.event.groupBy({ by: ["type"], _count: { _all: true } });
  const c: Record<string, number> = {};
  for (const g of grouped) c[g.type] = g._count._all;

  const draftCreated = c["draft_created"] ?? 0;
  const approved = c["approved"] ?? 0;
  const approvedEdited = c["approved_edited"] ?? 0;
  const rejected = c["rejected"] ?? 0;
  const regenerated = c["regenerated"] ?? 0;
  const autoSent = c["auto_sent"] ?? 0;
  const sent = c["sent"] ?? 0;
  const held = c["held"] ?? 0;

  const approvals = approved + approvedEdited;
  const decisions = approvals + rejected;

  const approvalRate = pct(approvals, decisions);
  const verbatimRate = pct(approved, approvals);
  const regenRate = pct(regenerated, draftCreated);

  // Reply rate within 48h: of outbound messages we actually sent, how many got a
  // reply within two days. The signal that we're keeping relationships warm.
  const outSent = await prisma.message.findMany({
    where: { direction: "OUT", status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { not: null } },
    select: { sentAt: true, replyReceivedAt: true },
  });
  const repliedIn48 = outSent.filter(
    (m) =>
      m.replyReceivedAt &&
      m.sentAt &&
      m.replyReceivedAt.getTime() - m.sentAt.getTime() <= 48 * 3600 * 1000
  ).length;
  const replyRate = pct(repliedIn48, outSent.length);

  // Median edit distance among messages you actually edited.
  const edited = await prisma.message.findMany({
    where: { editDistance: { not: null } },
    select: { editDistance: true },
  });
  const dists = edited.map((e) => e.editDistance!).sort((a, b) => a - b);
  const medianEdit = dists.length ? dists[Math.floor(dists.length / 2)] : 0;

  // Rough time-saved estimate: a verbatim send saves ~40s of composing, an edited
  // one ~20s. Directional, not exact.
  const timeSavedMin = Math.round((approved * 40 + approvedEdited * 20) / 60);

  const verbatimGo = verbatimRate !== null && verbatimRate >= VERBATIM_TARGET;
  const approvalGo = approvalRate !== null && approvalRate >= APPROVAL_TARGET;

  let verdict: { cls: string; title: string; body: string };
  if (decisions < MIN_DECISIONS) {
    verdict = {
      cls: "wait",
      title: "⏳ Not enough data yet",
      body: `Make at least ${MIN_DECISIONS} approve/reject decisions in the pilot before reading the verdict. So far: ${decisions}.`,
    };
  } else if (verbatimGo && approvalGo) {
    verdict = {
      cls: "go",
      title: "✅ GO — the idea is validated",
      body: "You send most drafts unchanged and approve most of what's drafted. Voice capture works. Proceed to Phase 2 (consent/safety) and then the SaaS build.",
    };
  } else {
    const why = !verbatimGo
      ? "You're editing too many drafts — the 'in your voice' promise isn't landing yet."
      : "Too many drafts get rejected — draft quality is the gap.";
    verdict = {
      cls: "no",
      title: "⚠️ Not yet — improve drafts before building further",
      body: `${why} Tune the tone profiles / prompts and re-measure before investing in multi-tenancy.`,
    };
  }

  const now = new Date();
  const { pilotStartedAt } = await getSetting();
  const pilot = await loadPilot(pilotStartedAt, now);
  const readiness = await loadReadiness(now);
  const ps = pilot.summary;
  const notReady = readiness.filter((r) => r.state !== "ok").length;

  return (
    <>
      <h2>📓 Notebook pilot</h2>
      <div className={`verdict ${ps.verdict.cls}`}>
        <h3>{ps.verdict.title}</h3>
        <p>{ps.verdict.body}</p>
        {pilotStartedAt && (
          <p style={{ marginTop: 6 }}>
            Started{" "}
            {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(pilotStartedAt)}. Only
            activity since then counts.
          </p>
        )}
        <PilotControls started={!!pilotStartedAt} notReady={notReady} />
      </div>
      <div className="stats">
        <Stat
          num={fmtPct(ps.keepRate)}
          label="Suggestions you kept"
          target={`target ≥ ${Math.round(KEEP_TARGET * 100)}% · ${pilot.kept} of ${ps.suggestionDecisions} decided${pilot.pendingSuggestions ? ` · ${pilot.pendingSuggestions} waiting` : ""}`}
          state={ps.keepRate === null ? undefined : ps.keepGo ? "go" : "no"}
        />
        <Stat
          num={fmtPct(ps.actRate)}
          label="Reminders you acted on"
          target={`target ≥ ${Math.round(ACT_TARGET * 100)}% · ${ps.counts.acted} acted, ${ps.counts.dismissed} dismissed, ${ps.counts.ignored} ignored`}
          state={ps.actRate === null ? undefined : ps.actGo ? "go" : "no"}
        />
        <Stat
          num={String(pilot.reminderSends)}
          label="Messages sent because of a reminder"
          target={`target ≥ ${REMINDER_SENDS_TARGET} · ${pilot.reminderSendsReplied} got a reply`}
          state={pilot.reminderSends === 0 ? undefined : ps.sendsGo ? "go" : undefined}
        />
      </div>
      <div className="stats" style={{ marginTop: 12 }}>
        <Stat
          num={String(pilot.privateMentions)}
          label="Private topics in messages sent without approval"
          target="target 0"
          state={ps.safeGo ? "go" : "no"}
        />
        <Stat num={String(ps.counts.pending)} label="Reminders waiting for you" />
        <Stat num={String(ps.counts.snoozed)} label="Reminders snoozed" />
      </div>

      <h2>Ready for the pilot?</h2>
      {readiness.map((r) => (
        <div className="row" key={r.label}>
          <div style={{ width: 22 }}>{CHECK_ICON[r.state]}</div>
          <div style={{ flex: 1 }}>
            <span className="who">{r.label}</span>
            <div className="meta" style={{ marginTop: 2 }}>{r.detail}</div>
          </div>
        </div>
      ))}

      <h2>Draft quality verdict</h2>
      <div className={`verdict ${verdict.cls}`}>
        <h3>{verdict.title}</h3>
        <p>{verdict.body}</p>
      </div>

      <h2>Core signals</h2>
      <div className="stats">
        <Stat
          num={fmtPct(verbatimRate)}
          label="Sent verbatim (of approved)"
          target={`target ≥ ${Math.round(VERBATIM_TARGET * 100)}%`}
          state={verbatimRate === null ? undefined : verbatimGo ? "go" : "no"}
        />
        <Stat
          num={fmtPct(approvalRate)}
          label="Approval rate (approved vs rejected)"
          target={`target ≥ ${Math.round(APPROVAL_TARGET * 100)}%`}
          state={approvalRate === null ? undefined : approvalGo ? "go" : "no"}
        />
        <Stat
          num={fmtPct(replyRate)}
          label="Reply within 48h"
          target={`${repliedIn48}/${outSent.length} sent`}
        />
      </div>

      <h2>Drafting</h2>
      <div className="stats">
        <Stat num={String(draftCreated)} label="Drafts created" />
        <Stat num={fmtPct(regenRate)} label="Regenerated (of drafts)" target="high = bad drafts" />
        <Stat num={String(medianEdit)} label="Median edit distance (chars)" />
      </div>

      <h2>Outcomes</h2>
      <div className="stats">
        <Stat num={String(sent)} label="Total sent" />
        <Stat num={String(autoSent)} label="Auto-sent" />
        <Stat num={String(held)} label="Held / escalated" />
      </div>

      <h2>Decisions</h2>
      <div className="stats">
        <Stat num={String(approved)} label="Approved as-is" />
        <Stat num={String(approvedEdited)} label="Approved after edit" />
        <Stat num={String(rejected)} label="Rejected" />
      </div>

      <h2>Estimated time saved</h2>
      <div className="stats">
        <Stat num={`~${timeSavedMin} min`} label="Composing time saved (estimate)" />
      </div>
    </>
  );
}
