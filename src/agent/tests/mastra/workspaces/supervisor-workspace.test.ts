import { describe, expect, it, beforeEach, vi } from "vitest";
import { RequestContext } from "@mastra/core/request-context";

const mocks = vi.hoisted(() => ({
  Workspace: vi.fn(),
  LocalFilesystem: vi.fn(function (config) {
    return { kind: "LocalFilesystem", config };
  }),
  workspaces: [] as Array<{
    config: unknown;
    init: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("@mastra/core/workspace", () => ({
  Workspace: mocks.Workspace,
  LocalFilesystem: mocks.LocalFilesystem,
}));

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    APP_GITHUB_HTTPS_URL: "https://github.com/acme/orders-api.git",
  },
}));

function createRequestContext(incidentId?: string) {
  const requestContext = new RequestContext();
  if (incidentId) requestContext.set("incidentId", incidentId);
  return requestContext;
}

async function importWorkspaceModule() {
  return import("../../../src/mastra/workspaces/supervisor-workspace");
}

describe("supervisor workspace", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.workspaces.length = 0;
    mocks.Workspace.mockImplementation(function (config) {
      const workspace = {
        config,
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
      };
      mocks.workspaces.push(workspace);
      return workspace;
    });
  });

  it("creates a per-incident workspace on the synced knowledge-base path", async () => {
    const { prepareSupervisorWorkspace } = await importWorkspaceModule();

    const workspace = await prepareSupervisorWorkspace("incident-123");

    expect(workspace).toBe(mocks.workspaces[0]);
    expect(mocks.workspaces[0].init).toHaveBeenCalledTimes(1);
    expect(mocks.LocalFilesystem).toHaveBeenCalledWith({
      basePath: "/tmp/workspaces/incident-123/knowledge-base",
      readOnly: true,
    });
  });

  it("throws when incidentId is missing from request context", async () => {
    const { getSupervisorWorkspace } = await importWorkspaceModule();

    expect(() =>
      getSupervisorWorkspace({
        requestContext: createRequestContext(),
      }),
    ).toThrow("getSupervisorWorkspace: incidentId missing from request context");
  });

  it("returns the prepared workspace for the matching incidentId", async () => {
    const { prepareSupervisorWorkspace, getSupervisorWorkspace } =
      await importWorkspaceModule();

    const workspace = await prepareSupervisorWorkspace("incident-123");

    expect(
      getSupervisorWorkspace({
        requestContext: createRequestContext("incident-123"),
      }),
    ).toBe(workspace);
  });

  it("destroys the workspace and clears the cache", async () => {
    const {
      prepareSupervisorWorkspace,
      cleanupSupervisorWorkspace,
      getSupervisorWorkspace,
    } = await importWorkspaceModule();

    await prepareSupervisorWorkspace("incident-123");
    await cleanupSupervisorWorkspace("incident-123");

    expect(mocks.workspaces[0].destroy).toHaveBeenCalledTimes(1);
    expect(() =>
      getSupervisorWorkspace({
        requestContext: createRequestContext("incident-123"),
      }),
    ).toThrow(
      "getSupervisorWorkspace: workspace not prepared for incidentId incident-123",
    );
  });
});
