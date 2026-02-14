import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: we need to monkeypatch module loader
const Module = require("module") as any;
const originalLoad = Module._load;

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};

let logger: ReturnType<(typeof import("@/utils/logger"))["createScopedLogger"]>;

async function main() {
  const [{ createScopedLogger }, { ensurePullingPollSchedule },
    { startPullingWorkers }] = await Promise.all([
    import("@/utils/logger"),
    import("@/utils/pulling/queues"),
    import("@/utils/pulling/workers"),
  ]);

  logger = createScopedLogger("pulling-runner");
  await ensurePullingPollSchedule({ everyMs: 30_000 });
  const workers = startPullingWorkers();

  if (!workers) {
    logger.info("Workers not started");
    return;
  }

  logger.info("Pulling workers started");
}

main().catch((error) => {
  if (logger) {
    logger.error("Failed to start pulling workers", { error });
  } else {
    // eslint-disable-next-line no-console
    console.error("Failed to start pulling workers", error);
  }
  process.exit(1);
});
