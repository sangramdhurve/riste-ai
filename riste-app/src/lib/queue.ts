import { Queue, type ConnectionOptions } from "bullmq";

// Pass connection OPTIONS (not a live ioredis instance) to BullMQ. This avoids
// the dual-ioredis type clash (bullmq bundles its own copy) and lets BullMQ
// manage its own connections for the Queue and Worker. lazy by nature: nothing
// connects just because this module was imported (e.g. during `next build`).
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const u = new URL(redisUrl);
export const connection: ConnectionOptions = {
  host: u.hostname,
  port: Number(u.port || 6379),
  username: u.username || undefined,
  password: u.password || undefined,
  tls: u.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};

// One queue handles all outbound + inbound jobs.
export type GreetingJob = {
  type: "greeting";
  contactId: string;
  slot: "morning" | "evening" | "festival";
  festival?: string;
};
export type InboundJob = { type: "inbound"; messageId: string };
export type RisteJob = GreetingJob | InboundJob;

export const risteQueue = new Queue<RisteJob>("riste", { connection });
