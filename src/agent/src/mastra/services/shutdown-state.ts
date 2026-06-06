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

export function installShutdownSignalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  process.once("SIGTERM", () => markShuttingDown("SIGTERM"));
  process.once("SIGINT", () => markShuttingDown("SIGINT"));
}

export function resetShutdownStateForTests(): void {
  shuttingDown = false;
}
