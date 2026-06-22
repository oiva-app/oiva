import { afterEach, describe, expect, it, vi } from "vitest";
import lisaPayload from "../../fixtures/sample_alerts/lisa.json";
import { alertHookHandler } from "@/api/honeycomb-hook-handler";
import {
  markShuttingDown,
  resetShutdownStateForTests,
} from "@/runtime/shutdown-state";

const mocks = vi.hoisted(() => ({
  alertRepository: {
    findByVendorInstanceId: vi.fn(),
    insert: vi.fn(),
    attachToIncident: vi.fn(),
  },
  incidentRepository: {
    findActiveCandidates: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    updateStatus: vi.fn(),
  },
  start: vi.fn().mockResolvedValue(undefined),
  createRun: vi.fn(),
  getWorkflow: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    HONEYCOMB_SHARED_SECRET: "secret",
    CORRELATION_WINDOW_MINUTES: 30,
  },
}));

vi.mock("../../../src/mastra/repositories", () => ({
  alertRepository: mocks.alertRepository,
  incidentRepository: mocks.incidentRepository,
}));

vi.mock("../../../src/mastra/slack", () => ({
  progressReporter: {},
}));

function makeContext(options: {
  body?: unknown;
  jsonThrows?: boolean;
  token?: string;
}) {
  const mastra = {
    getWorkflow: mocks.getWorkflow,
    getLogger: () => ({ error: mocks.loggerError }),
  };

  return {
    req: {
      json: vi.fn(async () => {
        if (options.jsonThrows) throw new Error("bad json");
        return options.body;
      }),
      header: vi.fn((name: string) =>
        name.toLowerCase() === "x-honeycomb-webhook-token"
          ? options.token
          : undefined,
      ),
    },
    get: vi.fn((key: string) => (key === "mastra" ? mastra : undefined)),
    json: vi.fn((body: unknown, status = 200) =>
      Response.json(body, { status }),
    ),
  };
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json();
}

describe("alertHookHandler shutdown behavior", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetShutdownStateForTests();
  });

  it("still returns 400 for invalid JSON during shutdown", async () => {
    markShuttingDown("SIGTERM");

    const response = await alertHookHandler(
      makeContext({ jsonThrows: true, token: "secret" }) as never,
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: "invalid-json" });
  });

  it("still returns 401 for unauthorized alerts during shutdown", async () => {
    markShuttingDown("SIGTERM");

    const response = await alertHookHandler(
      makeContext({ body: lisaPayload, token: "wrong" }) as never,
    );

    expect(response.status).toBe(401);
    expect(await responseJson(response)).toEqual({
      error: "unauthorized",
      reason: "wrong-secret",
    });
  });

  it("rejects actionable alerts during shutdown before persistence or dispatch", async () => {
    markShuttingDown("SIGTERM");

    const response = await alertHookHandler(
      makeContext({ body: lisaPayload, token: "secret" }) as never,
    );

    expect(response.status).toBe(503);
    expect(await responseJson(response)).toEqual({ error: "shutting-down" });
    expect(mocks.alertRepository.findByVendorInstanceId).not.toHaveBeenCalled();
    expect(mocks.alertRepository.insert).not.toHaveBeenCalled();
    expect(mocks.alertRepository.attachToIncident).not.toHaveBeenCalled();
    expect(mocks.incidentRepository.findActiveCandidates).not.toHaveBeenCalled();
    expect(mocks.incidentRepository.create).not.toHaveBeenCalled();
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
