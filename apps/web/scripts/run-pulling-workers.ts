import { ensurePullingPollSchedule } from "@/utils/pulling/queues";
import { startPullingWorkers } from "@/utils/pulling/workers";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("pulling-runner");

async function main() {
  await ensurePullingPollSchedule({ everyMs: 30_000 });
  const workers = startPullingWorkers();

  if (!workers) {
    logger.info("Workers not started");
    return;
  }

  logger.info("Pulling workers started");
}

main().catch((error) => {
  logger.error("Failed to start pulling workers", { error });
  process.exit(1);
});
