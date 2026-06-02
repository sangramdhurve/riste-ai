import { Queue } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// One queue handles all outbound + inbound jobs.
export type GreetingJob = { type: "greeting"; contactId: string; slot: "morning" | "evening" | "festival"; festival?: string };
export type InboundJob = { type: "inbound"; messageId: string };
export type RisteJob = GreetingJob | InboundJob;

export const risteQueue = new Queue<RisteJob>("riste", { connection });
