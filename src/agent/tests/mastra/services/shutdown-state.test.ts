import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isShuttingDown,
  markShuttingDown,
  resetShutdownStateForTests,
} from "../../../src/mastra/services/shutdown-state";

describe("shutdown-state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetShutdownStateForTests();
  });

  it("starts in a non-shutdown state", () => {
    expect(isShuttingDown()).toBe(false);
  });

  it("marks the process as shutting down", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});

    markShuttingDown("SIGTERM");

    expect(isShuttingDown()).toBe(true);
  });

  it("is idempotent after shutdown starts", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    markShuttingDown("SIGTERM");
    markShuttingDown("SIGINT");

    expect(isShuttingDown()).toBe(true);
    expect(info).toHaveBeenCalledTimes(1);
  });
});
