import { Worker } from "bullmq";
import { connection } from "@/lib/queue";
import type { RisteJob } from "@/lib/queue";
import { processGreeting, processInbound } from "./processors";
import { startScheduler } from "./scheduler";
import { startEmailPoller } from "./email-poller";

console.log("[worker] starting Riste worker…");

// A Worker issues blocking Redis commands, so it gets its own connection
// (duplicated from the shared one) rather than sharing the Queue's.
const worker = new Worker<RisteJob>(
  "riste",
  async (job) => {
    const data = job.data;
    if (data.type === "greeting") await processGreeting(data);
    else if (data.type === "inbound") await processInbound(data);
  },
  { connection: connection.duplicate(), concurrency: 5 }
);

worker.on("completed", (job) => console.log(`[worker] done: ${job.id} (${job.data.type})`));
worker.on("failed", (job, err) => console.error(`[worker] failed: ${job?.id}`, err));

startScheduler();
startEmailPoller();

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
