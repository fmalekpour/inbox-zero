import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { env } from "@/env";
import { ensurePullingPollSchedule } from "@/utils/pulling/queues";
import { pollAllAccounts } from "@/utils/pulling/poller";
import { startPullingWorkers } from "@/utils/pulling/workers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 30_000;

// Global worker instances (lazy initialization)
let workersStarted = false;

function ensureWorkersStarted() {
  if (!workersStarted && env.PULLING_ENABLED) {
    console.log("[pulling] Starting workers...");
    startPullingWorkers();
    workersStarted = true;
    console.log("[pulling] Workers started");
  }
}

export const GET = withError("cron/pulling", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/pulling"));
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.PULLING_ENABLED) {
    return NextResponse.json({ skipped: true, reason: "pulling-disabled" });
  }

  ensureWorkersStarted();
  await ensurePullingPollSchedule({ everyMs: POLL_INTERVAL_MS });
  await pollAllAccounts();

  return NextResponse.json({ ok: true });
});

export const POST = withError("cron/pulling", async (request) => {
  console.log("[pulling] Received pulling trigger");
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/pulling"));
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.PULLING_ENABLED) {
    return NextResponse.json({ skipped: true, reason: "pulling-disabled" });
  }

  ensureWorkersStarted();
  console.log("[pulling] Starting ensurePullingPollSchedule...");
  await ensurePullingPollSchedule({ everyMs: POLL_INTERVAL_MS });
  console.log("[pulling] Starting pollAllAccounts...");
  await pollAllAccounts();
  console.log("[pulling] Completed successfully");

  return NextResponse.json({ ok: true });
});
