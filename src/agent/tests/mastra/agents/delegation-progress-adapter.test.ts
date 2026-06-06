import { describe, it, expect, beforeEach } from "vitest";
import { FakeProgressReporter } from "../../../src/mastra/testing/fake-progress-reporter";
import { DelegationProgressTracker } from "../../../src/mastra/agents/delegation-progress-adapter";
import { threadIdForIncident } from "../../../src/mastra/domain/incident-thread";

describe("DelegationProgressTracker", () => {
  let reporter: FakeProgressReporter;
  let tracker: DelegationProgressTracker;

  beforeEach(() => {
    reporter = new FakeProgressReporter();
    tracker = new DelegationProgressTracker(reporter);
  });

  const startCtx = (
    incidentId: string,
    toolCallId: string,
    primitiveId = "codebase-agent",
  ) => ({
    threadId: threadIdForIncident(incidentId),
    toolCallId,
    primitiveId,
  });

  it("emits started then completed with the same task key", async () => {
    await tracker.started(startCtx("inc-1", "call-1"));
    await tracker.completed({
      toolCallId: "call-1",
      primitiveId: "codebase-agent",
      duration: 4200,
      success: true,
      result: { text: "HEADLINE: Pool exhaustion\nDetails..." },
    });

    expect(reporter.events).toEqual([
      {
        type: "delegationStarted",
        incidentId: "inc-1",
        taskKey: "codebase-agent",
      },
      {
        type: "delegationCompleted",
        incidentId: "inc-1",
        taskKey: "codebase-agent",
        outcome: {
          durationMs: 4200,
          success: true,
          headline: "Pool exhaustion",
        },
      },
    ]);
  });

  it("keeps two concurrent incidents separate (toolCallId keyed)", async () => {
    await tracker.started(startCtx("inc-A", "call-A", "telemetry-agent"));
    await tracker.started(startCtx("inc-B", "call-B", "codebase-agent"));
    await tracker.completed({
      toolCallId: "call-B",
      primitiveId: "codebase-agent",
      duration: 10,
      success: true,
      result: { text: "ok" },
    });
    await tracker.completed({
      toolCallId: "call-A",
      primitiveId: "telemetry-agent",
      duration: 20,
      success: true,
      result: { text: "ok" },
    });

    expect(
      reporter.ofType("delegationCompleted").map((e) => e.incidentId),
    ).toEqual(["inc-B", "inc-A"]);
  });

  it("no-ops a completion with no prior start", async () => {
    await tracker.completed({
      toolCallId: "ghost",
      primitiveId: "codebase-agent",
      duration: 1,
      success: true,
      result: { text: "x" },
    });
    expect(reporter.events).toEqual([]);
  });

  it("falls back to the error message when a failed delegation has no headline", async () => {
    await tracker.started(startCtx("inc-2", "call-2"));
    await tracker.completed({
      toolCallId: "call-2",
      primitiveId: "codebase-agent",
      duration: 99,
      success: false,
      result: { text: "" },
      error: new Error("workspace torn down"),
    });
    const [done] = reporter.ofType("delegationCompleted");
    expect(done.outcome).toEqual({
      durationMs: 99,
      success: false,
      headline: "workspace torn down",
    });
  });

  it("ignores a delegation whose thread is not an incident thread", async () => {
    await tracker.started({
      threadId: "weather:xyz",
      toolCallId: "call-3",
      primitiveId: "codebase-agent",
    });
    await tracker.completed({
      toolCallId: "call-3",
      primitiveId: "codebase-agent",
      duration: 1,
      success: true,
      result: { text: "x" },
    });
    expect(reporter.events).toEqual([]);
  });
});
