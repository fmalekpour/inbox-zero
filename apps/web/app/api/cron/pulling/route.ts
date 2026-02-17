import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { env } from "@/env";
import { ensurePullingPollSchedule } from "@/utils/pulling/queues";
import { pollAllAccounts } from "@/utils/pulling/poller";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_INTERVAL_MS = 30_000;

export const GET = withError("cron/pulling", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/pulling"));
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.PULLING_ENABLED) {
    return NextResponse.json({ skipped: true, reason: "pulling-disabled" });
  }

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

  console.log("[pulling] Starting ensurePullingPollSchedule...");
  await ensurePullingPollSchedule({ everyMs: POLL_INTERVAL_MS });
  console.log("[pulling] Starting pollAllAccounts...");
  await pollAllAccounts();
  console.log("[pulling] Completed successfully");

  return NextResponse.json({ ok: true });
});
