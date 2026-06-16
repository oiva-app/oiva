import { incidentRepository } from "@/repositories";
import { progressReporter } from "@/slack";
import { reapStaleIncidents } from "./cleanup-reaper";
import { env } from "@/config/env";

interface ReaperLogger {
  info?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

const MINUTE_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = true;

export function startCleanupReaper(opts?: {
  logger?: ReaperLogger;
}): () => void {
  if (!env.REAPER_ENABLED) {
    opts?.logger?.info?.("cleanup reaper disabled (REAPER_ENABLED=false)");
    return () => {};
  }
  if (!stopped) {
    return stopCleanupReaper; // already running
  }

  const logger = opts?.logger;
  const intervalMs = env.REAPER_INTERVAL_MINUTES * MINUTE_MS;
  const thresholds = {
    deliveredQuietMs: env.REAPER_DELIVERED_QUIET_MINUTES * MINUTE_MS,
    failedQuietMs: env.REAPER_FAILED_QUIET_MINUTES * MINUTE_MS,
    stuckDeadlineMs: env.REAPER_STUCK_DEADLINE_MINUTES * MINUTE_MS,
  };

  stopped = false;

  const runOnce = async (): Promise<void> => {
    const startedAt = Date.now();
    try {
      const summary = await reapStaleIncidents({
        incidents: incidentRepository,
        reporter: progressReporter,
        thresholds,
      });
      logger?.info?.("cleanup reaper sweep complete", {
        durationMs: Date.now() - startedAt,
        deliveredClosed: summary.deliveredClosed.length,
        failedClosed: summary.failedClosed.length,
        stuckFailed: summary.stuckFailed.length,
        errorCount: summary.errors.length,
        ...(summary.errors.length > 0 ? { errors: summary.errors } : {}),
      });
    } catch (err) {
      // Infra-level failure (e.g. DB unreachable). Never let it escape into the
      // server's event loop as an unhandled rejection.
      logger?.error?.("cleanup reaper sweep failed", {
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const scheduleNext = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runOnce().finally(scheduleNext); // re-arm only after completion
    }, intervalMs);
    timer.unref(); // fire only alongside a running server; never block exit
  };

  scheduleNext(); // first sweep one interval out — keeps build/boot clean
  logger?.info?.("cleanup reaper started", {
    intervalMinutes: env.REAPER_INTERVAL_MINUTES,
  });

  process.once("SIGTERM", stopCleanupReaper);
  process.once("SIGINT", stopCleanupReaper);

  return stopCleanupReaper;
}

export function stopCleanupReaper(): void {
  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
  }
}
