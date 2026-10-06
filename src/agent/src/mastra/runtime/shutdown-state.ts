import { shutdownLogs } from "@/observability/logging";
export type ShutdownSignal = "SIGTERM" | "SIGINT";

let shuttingDown = false;
let handlersInstalled = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function markShuttingDown(reason: ShutdownSignal): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("shutdown-state: shutting down", { reason });
}

let logsShutDown = false;
const flushLogsOnce = async () => {
  if (logsShutDown) return;
  logsShutDown = true;
  await shutdownLogs();
};

export function installShutdownSignalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  // Natural exit (loop drains before the SIGTERM timer fires): flush here,
  // since the unref'd timeout below won't keep the process alive.
  process.on("beforeExit", () => {
    void flushLogsOnce();
  });

  process.once("SIGTERM", () => {
    markShuttingDown("SIGTERM");
    // Allow routine requests to finish, then exit before ECS SIGKILL (stop_timeout = 60s).
    setTimeout(async () => {
      console.info(
        "shutdown-state: exiting process after SIGTERM grace period",
      );
      await flushLogsOnce(); // flush buffered OTLP logs before exit
      process.exit(0);
    }, 15_000).unref();
  });

  process.once("SIGINT", () => {
    markShuttingDown("SIGINT");
    setTimeout(async () => {
      await flushLogsOnce(); // also flush on Ctrl+C (dev)
      process.exit(0);
    }, 500).unref();
  });
}

export function resetShutdownStateForTests(): void {
  shuttingDown = false;
}
