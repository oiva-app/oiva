/**
 * Cleanup reaper runner — one-shot sweep of stale incidents.
 *
 * Drains parked (delivered/failed) and stuck incidents per
 * services/cleanup-reaper.ts, then exits. Meant to be invoked periodically by
 * an EXTERNAL scheduler (cron, a platform scheduled job, a k8s CronJob) — NOT
 * run as a daemon. Each run is independent and idempotent: safe on any cadence,
 * and a run that overlaps a human Close/Retry or a finishing workflow is a
 * no-op. Unlike scripts/migrate.ts (which loads only Postgres config by hand),
 * the reaper reuses the real app singletons — it genuinely needs the DB pool,
 * the Slack reporter, and the full validated env.
 *
 * Run: `npm run reap` (or `npx tsx scripts/reap.ts`).
 */
import { incidentRepository } from "../src/mastra/repositories";
import { progressReporter } from "../src/mastra/slack";
import { reapStaleIncidents } from "../src/mastra/services/cleanup-reaper";
import { pool } from "../src/mastra/db/client";
import { env } from "../src/mastra/config/env";

const MINUTE_MS = 60_000;

async function main() {
  const summary = await reapStaleIncidents({
    incidents: incidentRepository,
    reporter: progressReporter,
    thresholds: {
      deliveredQuietMs: env.REAPER_DELIVERED_QUIET_MINUTES * MINUTE_MS,
      failedQuietMs: env.REAPER_FAILED_QUIET_MINUTES * MINUTE_MS,
      stuckDeadlineMs: env.REAPER_STUCK_DEADLINE_MINUTES * MINUTE_MS,
    },
  });

  // One wide structured event so the scheduler's logs answer "what did this run
  // do?" — ids included for correlation, not just counts (Majors).
  console.log(
    JSON.stringify({
      msg: "reaper cleanup complete",
      deliveredClosed: summary.deliveredClosed,
      failedClosed: summary.failedClosed,
      stuckFailed: summary.stuckFailed,
      errorCount: summary.errors.length,
      errors: summary.errors,
    }),
  );

  // Partial failure → non-zero exit so the scheduler can alert, but only after
  // the successful transitions above are committed and logged. Use exitCode
  // (not process.exit) so the pool drains and the log flushes first.
  if (summary.errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("reaper cleanup failed:", err);
    process.exitCode = 1;
  })
  // End the shared pool so the process exits; swallow a double-end if a SIGTERM
  // already triggered db/client's graceful shutdown mid-run.
  .finally(() => pool.end().catch(() => {}));
