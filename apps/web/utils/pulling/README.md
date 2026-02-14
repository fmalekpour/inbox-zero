# Pulling workers

This module provides a BullMQ-based pulling system for Gmail accounts. It polls Gmail history and queues message processing jobs, persisting processing state in Postgres.

## Requirements
- `REDIS_URL` configured (BullMQ uses Redis)
- `PULLING_ENABLED=true`
- `PULLING_DRY_RUN=true|false`

## How it works
- A polling worker enqueues new Gmail message IDs based on `lastSyncedHistoryId`.
- A processing worker runs the shared message processor and records status in `EmailPullMessage`.

## Run locally
Use the script in `scripts/run-pulling-workers.ts` to start workers. Ensure Redis + Postgres are running and `.env.local` is set up.

## Cron trigger
Call `GET /api/cron/pulling` (or POST with `CRON_SECRET` in body) to schedule the repeat job and run an immediate poll.