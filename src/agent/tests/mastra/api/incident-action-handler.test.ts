import { afterEach, describe, expect, it, vi } from "vitest";
import lisaPayload from "../../fixtures/sample_alerts/lisa.json";
import { handleIncidentRetry } from "../../../src/mastra/api/incident-action-handler";
import {
  markShuttingDown,
  resetShutdownStateForTests,
} from "../../../src/mastra/services/shutdown-state";

const incidentId = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  alertRepository: {
    findFirstByIncident: vi.fn(),
  },
  incidentRepository: {
    findById: vi.fn(),
  },
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
  progressReporter: {},
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
