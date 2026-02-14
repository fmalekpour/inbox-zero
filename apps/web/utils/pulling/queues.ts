import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { buildPullingMessageJobId } from "@/utils/pulling/ids";

const logger = createScopedLogger("pulling-queue");

export const PULLING_POLL_QUEUE = "pulling-poll";
export const PULLING_MESSAGE_QUEUE = "pulling-message";

export type PullingPollJob = {
  jobType: "poll-accounts";
};

export type PullingMessageJob = {
  emailAccountId: string;
  messageId: string;
  threadId?: string;
  sourceHistoryId?: string;
};

let connection: Redis | null = null;

export function getPullingRedisConnection(): Redis {
  if (!env.REDIS_URL) {
    throw new Error("REDIS_URL is required for BullMQ pulling workers");
  }

  if (!connection) {
    connection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    connection.on("error", (error) =>
      logger.error("Redis connection error", { error }),
    );
  }

  return connection;
}

let pollQueue: Queue<PullingPollJob> | null = null;
let messageQueue: Queue<PullingMessageJob> | null = null;

export function getPullingPollQueue() {
  if (!pollQueue) {
    pollQueue = new Queue<PullingPollJob>(PULLING_POLL_QUEUE, {
      connection: getPullingRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 1000,
      },
    });
  }

  return pollQueue;
}

export function getPullingMessageQueue() {
  if (!messageQueue) {
    messageQueue = new Queue<PullingMessageJob>(PULLING_MESSAGE_QUEUE, {
      connection: getPullingRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 2000,
      },
    });
  }

  return messageQueue;
}

export async function ensurePullingPollSchedule(options: {
  everyMs: number;
}) {
  if (!env.PULLING_ENABLED) {
    logger.info("Pulling disabled, skipping schedule setup");
    return;
  }

  await getPullingPollQueue().add(
    "poll-accounts",
    { jobType: "poll-accounts" },
    {
      jobId: "poll-accounts",
      repeat: { every: options.everyMs },
    },
  );
}
