import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function () {
    return { send: mocks.send };
  }),
  ListObjectsV2Command: vi.fn(function (input) {
    return { input, kind: "ListObjectsV2Command" };
  }),
  GetObjectCommand: vi.fn(function (input) {
    return { input, kind: "GetObjectCommand" };
  }),
}));

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    APP_GITHUB_REPOSITORIES: [
      { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
    ],
    KNOWLEDGE_BASE_S3_BUCKET: "test-bucket",
    KNOWLEDGE_BASE_S3_PREFIX: "three-services-demo/knowledge-base",
    AWS_REGION: "us-east-1",
  },
}));

const workspaceRoot = "/tmp/workspaces";

async function importSyncModule() {
  return import("../../../src/mastra/workspaces/knowledge-base-sync");
}

function listResponse(keys: string[], nextToken?: string) {
  return {
    Contents: keys.map((Key) => ({ Key })),
    NextContinuationToken: nextToken,
  };
}

function getResponse(content: string) {
  return {
    Body: {
      transformToByteArray: async () => Buffer.from(content),
    },
  };
}

describe("knowledge-base sync", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await fs.rm(path.join(workspaceRoot, "incident-kb"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceRoot, "incident-traversal"), {
      recursive: true,
      force: true,
    });
  });

  afterEach(async () => {
    await fs.rm(path.join(workspaceRoot, "incident-kb"), {
      recursive: true,
      force: true,
    });
    await fs.rm(path.join(workspaceRoot, "incident-traversal"), {
      recursive: true,
      force: true,
    });
  });

  it("downloads S3 objects into the per-incident knowledge-base directory", async () => {
    const contentByKey: Record<string, string> = {
      "three-services-demo/knowledge-base/ARCHITECTURE.md": "architecture",
      "three-services-demo/knowledge-base/services/api.md": "api",
    };

    mocks.send.mockImplementation((command) => {
      if (command.kind === "ListObjectsV2Command") {
        return Promise.resolve(
          listResponse([
            "three-services-demo/knowledge-base/",
            "three-services-demo/knowledge-base/ARCHITECTURE.md",
            "three-services-demo/knowledge-base/services/api.md",
          ]),
        );
      }
      return Promise.resolve(getResponse(contentByKey[command.input.Key]));
    });

    const { syncKnowledgeBaseForIncident } = await importSyncModule();

    const destination = await syncKnowledgeBaseForIncident("incident-kb");

    expect(destination).toBe("/tmp/workspaces/incident-kb/knowledge-base");
    await expect(
      fs.readFile(
        "/tmp/workspaces/incident-kb/knowledge-base/ARCHITECTURE.md",
        "utf8",
      ),
    ).resolves.toBe("architecture");
    await expect(
      fs.readFile(
        "/tmp/workspaces/incident-kb/knowledge-base/services/api.md",
        "utf8",
      ),
    ).resolves.toBe("api");
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it("clears stale files before syncing and handles paginated listings", async () => {
    await fs.mkdir("/tmp/workspaces/incident-kb/knowledge-base", {
      recursive: true,
    });
    await fs.writeFile(
      "/tmp/workspaces/incident-kb/knowledge-base/stale.md",
      "stale",
    );

    mocks.send
      .mockResolvedValueOnce(
        listResponse(
          ["three-services-demo/knowledge-base/first.md"],
          "next-page",
        ),
      )
      .mockResolvedValueOnce(getResponse("first"))
      .mockResolvedValueOnce(
        listResponse(["three-services-demo/knowledge-base/second.md"]),
      )
      .mockResolvedValueOnce(getResponse("second"));

    const { syncKnowledgeBaseForIncident } = await importSyncModule();

    await syncKnowledgeBaseForIncident("incident-kb");

    await expect(
      fs.access("/tmp/workspaces/incident-kb/knowledge-base/stale.md"),
    ).rejects.toThrow();
    await expect(
      fs.readFile("/tmp/workspaces/incident-kb/knowledge-base/first.md", "utf8"),
    ).resolves.toBe("first");
    await expect(
      fs.readFile(
        "/tmp/workspaces/incident-kb/knowledge-base/second.md",
        "utf8",
      ),
    ).resolves.toBe("second");
  });

  it("rejects path traversal keys", async () => {
    mocks.send.mockResolvedValueOnce(
      listResponse(["three-services-demo/knowledge-base/../escape.md"]),
    );

    const { syncKnowledgeBaseForIncident } = await importSyncModule();

    await expect(
      syncKnowledgeBaseForIncident("incident-traversal"),
    ).rejects.toThrow("Rejected S3 object path outside destination");
    await expect(
      fs.access("/tmp/workspaces/incident-traversal/escape.md"),
    ).rejects.toThrow();
  });
});
