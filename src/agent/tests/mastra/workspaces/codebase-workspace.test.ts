import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RequestContext } from "@mastra/core/request-context";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  Workspace: vi.fn(),
  LocalFilesystem: vi.fn(function (config) {
    return { kind: "LocalFilesystem", config };
  }),
  LocalSandbox: vi.fn(function (config) {
    return { kind: "LocalSandbox", config };
  }),
  workspaces: [] as Array<{
    config: unknown;
    init: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

vi.mock("@mastra/core/workspace", () => ({
  Workspace: mocks.Workspace,
  LocalFilesystem: mocks.LocalFilesystem,
  LocalSandbox: mocks.LocalSandbox,
}));

const testRoot = path.join(os.tmpdir(), "oiva-codebase-workspace-test");
const workspaceBasePath = "/tmp/workspaces";

function mockEnv(repositories = [
  { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
  {
    name: "orders-worker",
    url: "https://github.com/acme/orders-worker.git",
  },
]) {
  vi.doMock("../../../src/mastra/config/env", () => ({
    env: {
      APP_GITHUB_REPOSITORIES: repositories,
      GITHUB_PAT: "test-token",
    },
  }));
}

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    APP_GITHUB_REPOSITORIES: [
      { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
      {
        name: "orders-worker",
        url: "https://github.com/acme/orders-worker.git",
      },
    ],
    GITHUB_PAT: "test-token",
  },
}));

async function importWorkspaceModule() {
  return import("../../../src/mastra/workspaces/codebase-workspace");
}

function setExecFileSuccess() {
  mocks.execFile.mockImplementation((_cmd, _args, _options, callback) => {
    callback(null, "", "");
  });
}

function createRequestContext(incidentId?: string) {
  const requestContext = new RequestContext();
  if (incidentId) requestContext.set("incidentId", incidentId);
  return requestContext;
}

describe("codebase workspace", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockEnv();
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
    setExecFileSuccess();
    await fs.rm(testRoot, { recursive: true, force: true });
    await fs.rm(path.join(workspaceBasePath, "incident-123"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceBasePath, "incident-sync-failure"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceBasePath, "incident-clone-failure"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceBasePath, "incident-path-escape"), {
      recursive: true,
      force: true,
    });
  });

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
    await fs.rm(path.join(workspaceBasePath, "incident-123"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceBasePath, "incident-sync-failure"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceBasePath, "incident-clone-failure"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceBasePath, "incident-path-escape"), {
      recursive: true,
      force: true,
    });
  });

  it("clones and initializes a workspace once for an incident", async () => {
    const { prepareCodebaseAgentWorkspace } = await importWorkspaceModule();

    const workspace = await prepareCodebaseAgentWorkspace("incident-123");

    expect(workspace).toBe(mocks.workspaces[0]);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
    expect(mocks.execFile).toHaveBeenNthCalledWith(
      1,
      "git",
      [
        "clone",
        "--shallow-since",
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        "https://github.com/acme/orders-api.git",
        path.join(workspaceBasePath, "incident-123", "codebase", "orders-api"),
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_TERMINAL_PROMPT: "0",
          GITHUB_PAT: "test-token",
        }),
        maxBuffer: 1024 * 1024 * 10,
      }),
      expect.any(Function),
    );
    expect(mocks.execFile).toHaveBeenNthCalledWith(
      2,
      "git",
      [
        "clone",
        "--shallow-since",
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        "https://github.com/acme/orders-worker.git",
        path.join(
          workspaceBasePath,
          "incident-123",
          "codebase",
          "orders-worker",
        ),
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_TERMINAL_PROMPT: "0",
          GITHUB_PAT: "test-token",
        }),
        maxBuffer: 1024 * 1024 * 10,
      }),
      expect.any(Function),
    );
    expect(mocks.Workspace).toHaveBeenCalledTimes(1);
    expect(mocks.workspaces[0].init).toHaveBeenCalledTimes(1);
    expect(mocks.LocalFilesystem).toHaveBeenCalledWith({
      basePath: path.join(workspaceBasePath, "incident-123", "knowledge-base"),
      readOnly: true,
    });
    expect(mocks.LocalFilesystem).toHaveBeenCalledWith({
      basePath: path.join(workspaceBasePath, "incident-123", "codebase"),
    });
    expect(mocks.LocalSandbox).toHaveBeenCalledWith({
      workingDirectory: path.join(
        workspaceBasePath,
        "incident-123",
        "codebase",
      ),
    });
  });

  it("returns the cached workspace for the same incident", async () => {
    const { prepareCodebaseAgentWorkspace } = await importWorkspaceModule();

    const firstWorkspace = await prepareCodebaseAgentWorkspace("incident-123");
    const secondWorkspace = await prepareCodebaseAgentWorkspace("incident-123");

    expect(secondWorkspace).toBe(firstWorkspace);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
    expect(mocks.Workspace).toHaveBeenCalledTimes(1);
    expect(mocks.workspaces[0].init).toHaveBeenCalledTimes(1);
  });

  it("cleans up the incident workspace when a repository clone fails", async () => {
    mocks.execFile.mockImplementation((_cmd, args, _options, callback) => {
      if (args.includes("https://github.com/acme/orders-worker.git")) {
        callback(new Error("clone failed"), "", "");
        return;
      }

      callback(null, "", "");
    });

    const { prepareCodebaseAgentWorkspace } = await importWorkspaceModule();
    const incidentSandboxPath = path.join(
      workspaceBasePath,
      "incident-clone-failure",
    );

    await expect(
      prepareCodebaseAgentWorkspace("incident-clone-failure"),
    ).rejects.toThrow("clone failed");

    expect(mocks.execFile).toHaveBeenCalledTimes(2);
    expect(mocks.Workspace).not.toHaveBeenCalled();
    await expect(fs.access(incidentSandboxPath)).rejects.toThrow();
  });

  it("rejects repository names that escape the codebase root before cloning", async () => {
    mockEnv([
      { name: "..", url: "https://github.com/acme/orders-api.git" },
    ]);

    const { prepareCodebaseAgentWorkspace } = await importWorkspaceModule();
    const incidentSandboxPath = path.join(
      workspaceBasePath,
      "incident-path-escape",
    );

    await expect(
      prepareCodebaseAgentWorkspace("incident-path-escape"),
    ).rejects.toThrow("Repository name escapes codebase root: ..");

    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.Workspace).not.toHaveBeenCalled();
    await expect(fs.access(incidentSandboxPath)).rejects.toThrow();
  });

  it("preserves the synced knowledge base when resetting the codebase sandbox", async () => {
    const knowledgeBasePath = path.join(
      workspaceBasePath,
      "incident-123",
      "knowledge-base",
    );
    await fs.mkdir(knowledgeBasePath, { recursive: true });
    await fs.writeFile(path.join(knowledgeBasePath, "ARCHITECTURE.md"), "kb");

    const { prepareCodebaseAgentWorkspace } = await importWorkspaceModule();

    await prepareCodebaseAgentWorkspace("incident-123");

    await expect(
      fs.readFile(path.join(knowledgeBasePath, "ARCHITECTURE.md"), "utf8"),
    ).resolves.toBe("kb");
  });

  it("throws when incidentId is missing from request context", async () => {
    const { getCodebaseAgentWorkspace } = await importWorkspaceModule();

    expect(() =>
      getCodebaseAgentWorkspace({
        requestContext: createRequestContext(),
      }),
    ).toThrow("getCodebaseAgentWorkspace: incidentId missing from request context");
  });

  it("returns the prepared workspace for the matching incidentId", async () => {
    const { prepareCodebaseAgentWorkspace, getCodebaseAgentWorkspace } =
      await importWorkspaceModule();

    const workspace = await prepareCodebaseAgentWorkspace("incident-123");
    const requestContext = createRequestContext("incident-123");

    expect(getCodebaseAgentWorkspace({ requestContext })).toBe(workspace);
  });

  it("destroys the workspace, removes the sandbox, and clears the cache", async () => {
    const {
      prepareCodebaseAgentWorkspace,
      cleanupCodebaseAgentWorkspace,
      getCodebaseAgentWorkspace,
    } = await importWorkspaceModule();

    await prepareCodebaseAgentWorkspace("incident-123");
    const incidentSandboxPath = path.join(workspaceBasePath, "incident-123");
    await fs.mkdir(incidentSandboxPath, { recursive: true });

    await cleanupCodebaseAgentWorkspace("incident-123");

    expect(mocks.workspaces[0].destroy).toHaveBeenCalledTimes(1);
    await expect(fs.access(incidentSandboxPath)).rejects.toThrow();
    expect(() =>
      getCodebaseAgentWorkspace({
        requestContext: createRequestContext("incident-123"),
      }),
    ).toThrow(
      "getCodebaseAgentWorkspace: workspace not prepared for incidentId incident-123",
    );
  });

});
