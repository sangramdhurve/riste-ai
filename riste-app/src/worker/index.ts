import "./env";
import { Worker } from "bullmq";
import { connection } from "@/lib/queue";
import type { RisteJob } from "@/lib/queue";
import { processExtractNotes, processGreeting, processInbound, processReminderDraft, processReminders } from "./processors";
import { startScheduler } from "./scheduler";
import { startEmailPoller } from "./email-poller";
import { startFestivalRefresh } from "./festival-refresh";

console.log("[worker] starting Riste worker…");

// BullMQ creates its own connection from these options (a Worker needs its own
// blocking connection, which BullMQ handles internally).
const worker = new Worker<RisteJob>(
  "riste",
  async (job) => {
    const data = job.data;
    if (data.type === "greeting") await processGreeting(data);
    else if (data.type === "inbound") await processInbound(data);
    else if (data.type === "reminders") await processReminders(data);
    else if (data.type === "reminderDraft") await processReminderDraft(data);
    else if (data.type === "extractNotes") await processExtractNotes(data);
  },
  { connection, concurrency: 5 }
);

worker.on("completed", (job) => console.log(`[worker] done: ${job.id} (${job.data.type})`));
worker.on("failed", (job, err) => console.error(`[worker] failed: ${job?.id}`, err));

startScheduler();
startEmailPoller();
startFestivalRefresh();

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
