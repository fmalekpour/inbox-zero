import { Worker } from "bullmq";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import {
  getPullingRedisConnection,
  PULLING_MESSAGE_QUEUE,
  PULLING_POLL_QUEUE,
} from "@/utils/pulling/queues";
import { pollAllAccounts } from "@/utils/pulling/poller";
import { processPullingMessage } from "@/utils/pulling/processor";

const logger = createScopedLogger("pulling-workers");

export function startPullingWorkers() {
  if (!env.PULLING_ENABLED) {
    logger.info("Pulling disabled, workers will not start");
    return null;
  }

  const connection = getPullingRedisConnection();

  const pollWorker = new Worker(
    PULLING_POLL_QUEUE,
    async () => {
      await pollAllAccounts();
    },
    { connection, concurrency: 1 },
  );

  const messageWorker = new Worker(
    PULLING_MESSAGE_QUEUE,
    async (job) => {
      await processPullingMessage(job.data);
    },
    { connection, concurrency: 4 },
  );

  pollWorker.on("failed", (job, error) =>
    logger.error("Poll job failed", { jobId: job?.id, error }),
  );

  messageWorker.on("failed", (job, error) =>
    logger.error("Message job failed", { jobId: job?.id, error }),
  );

  return { pollWorker, messageWorker };
}
