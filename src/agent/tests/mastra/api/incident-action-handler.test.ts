import { afterEach, describe, expect, it, vi } from "vitest";
import lisaPayload from "../../fixtures/sample_alerts/lisa.json";
import {
  handleIncidentClose,
  handleIncidentRetry,
} from "../../../src/mastra/api/incident-action-handler";
import {
  markShuttingDown,
  resetShutdownStateForTests,
} from "@/runtime/shutdown-state";

const incidentId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  alertRepository: {
    findFirstByIncident: vi.fn(),
  },
  incidentRepository: {
    findById: vi.fn(),
    closeIfOpen: vi.fn(),
  },
  incidentClosed: vi.fn(),
  postEphemeralError: vi.fn(),
  createRun: vi.fn(),
  getWorkflow: vi.fn(),
  warn: vi.fn(),
  start: vi.fn(),
}));

vi.mock("../../../src/mastra/repositories", () => ({
  alertRepository: mocks.alertRepository,
  incidentRepository: mocks.incidentRepository,
}));

vi.mock("../../../src/mastra/slack", () => ({
  progressReporter: { incidentClosed: mocks.incidentClosed },
}));

vi.mock("../../../src/mastra/slack/client", () => ({
  postEphemeralError: mocks.postEphemeralError,
}));

function failedIncident() {
  return {
    id: incidentId,
    status: "failed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    statusUpdated: new Date("2026-01-01T00:00:00Z"),
    resolvedAt: null,
    slackThreadTs: null,
    slackChannelId: null,
  };
}

function makeMastra() {
  return {
    getWorkflow: mocks.getWorkflow,
    getLogger: () => ({ warn: mocks.warn }),
  };
}

describe("incident action shutdown behavior", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetShutdownStateForTests();
  });

  it("does not create a retry workflow run during shutdown", async () => {
    markShuttingDown("SIGTERM");
    mocks.incidentRepository.findById.mockResolvedValue(failedIncident());
    mocks.alertRepository.findFirstByIncident.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      incidentId,
      receivedAt: new Date("2026-01-01T00:00:00Z"),
      rawPayload: lisaPayload,
      source: "honeycomb",
      vendorInstanceId: lisaPayload.alert.instanceId,
      triggerName: lisaPayload.name,
      dataset: "__all__",
      queryId: "HwVZ4E1hbwr",
    });

    await handleIncidentRetry(incidentId, makeMastra() as never);

    expect(mocks.getWorkflow).not.toHaveBeenCalled();
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith("retry workflow dispatch skipped", {
      incidentId,
      reason: "shutting-down",
    });
  });

});

describe("handleIncidentClose", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const deliveredIncident = () => ({
    id: incidentId,
    status: "report_delivered",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    statusUpdated: new Date("2026-01-01T00:00:00Z"),
    resolvedAt: null,
    slackThreadTs: "T1",
    slackChannelId: "C1",
  });

  it("closes and notifies the reporter, without an ephemeral", async () => {
    mocks.incidentRepository.findById.mockResolvedValue(deliveredIncident());
    mocks.incidentRepository.closeIfOpen.mockResolvedValue(true);

    await handleIncidentClose(incidentId, "U1", "C1", "T1");

    expect(mocks.incidentClosed).toHaveBeenCalledWith(incidentId, {
      kind: "user",
      userId: "U1",
    });
    expect(mocks.postEphemeralError).not.toHaveBeenCalled();
  });

  it("stays silent when the incident was already closed (lost the race)", async () => {
    mocks.incidentRepository.findById.mockResolvedValue(deliveredIncident());
    mocks.incidentRepository.closeIfOpen.mockResolvedValue(false);

    await handleIncidentClose(incidentId, "U1", "C1", "T1");

    expect(mocks.incidentClosed).not.toHaveBeenCalled();
    expect(mocks.postEphemeralError).not.toHaveBeenCalled();
  });

  it("alerts the clicker with an ephemeral when the close throws", async () => {
    mocks.incidentRepository.findById.mockResolvedValue(null); // not found → throws
    mocks.postEphemeralError.mockResolvedValue(undefined);

    await expect(
      handleIncidentClose(incidentId, "U1", "C1", "T1"),
    ).rejects.toThrow(/not found/);

    expect(mocks.postEphemeralError).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "C1", user: "U1", threadTs: "T1" }),
    );
    expect(mocks.incidentClosed).not.toHaveBeenCalled();
  });
});
