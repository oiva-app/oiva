import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const originalCwd = process.cwd();
let testRoot: string;

const requiredEnv = {
  OBSERVED_APP_NAME: "orders-api",
  OPENAI_API_KEY: "openai-key",
  HC_MCP_KEY: "hc-mcp-key",
  COLLECTOR_ENDPOINT: "http://localhost:4318/v1/traces",
  GITHUB_PAT: "github-token",
  APP_GITHUB_HTTPS_URL: "https://github.com/acme/orders-api.git",
  NODE_ENV: "development",
  KNOWLEDGE_BASE_S3_BUCKET: "test-bucket",
  AWS_REGION: "us-east-1",
  SLACK_BOT_TOKEN: "slack-token",
  SLACK_CHANNEL_ID: "slack-channel",
  SLACK_SIGNING_SECRET: "slack-secret",
  POSTGRES_HOST: "localhost",
  POSTGRES_PORT: "5432",
  POSTGRES_USER: "oiva",
  POSTGRES_PASSWORD: "password",
  POSTGRES_DB: "oiva",
};

async function importEnv() {
  vi.resetModules();
  return import("../../../src/mastra/config/env");
}

function stubRequiredEnv(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({
    ...requiredEnv,
    ...overrides,
  })) {
    if (value === undefined) {
      vi.stubEnv(key, undefined);
    } else {
      vi.stubEnv(key, value);
    }
  }
}

describe("env config", () => {
  beforeEach(async () => {
    vi.resetModules();
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oiva-env-test-"));
    process.chdir(testRoot);
    stubRequiredEnv();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.resetModules();
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it("does not require a .env file", async () => {
    const { env } = await importEnv();

    expect(env.KNOWLEDGE_BASE_S3_BUCKET).toBe("test-bucket");
    expect(env.DATABASE_URL).toBe(
      "postgresql://oiva:password@localhost:5432/oiva",
    );
  });

  it("loads .env when present", async () => {
    vi.stubEnv("KNOWLEDGE_BASE_S3_BUCKET", undefined);
    vi.stubEnv("KNOWLEDGE_BASE_S3_PREFIX", undefined);

    await fs.writeFile(
      path.join(testRoot, ".env"),
      [
        "KNOWLEDGE_BASE_S3_BUCKET=dotenv-bucket",
        "KNOWLEDGE_BASE_S3_PREFIX=kb",
      ].join("\n"),
    );

    const { env } = await importEnv();

    expect(env.KNOWLEDGE_BASE_S3_BUCKET).toBe("dotenv-bucket");
    expect(env.KNOWLEDGE_BASE_S3_PREFIX).toBe("kb");
  });

  it("requires the S3 bucket", async () => {
    stubRequiredEnv({ KNOWLEDGE_BASE_S3_BUCKET: undefined });

    await expect(importEnv()).rejects.toThrow("KNOWLEDGE_BASE_S3_BUCKET");
  });

  it("requires AWS_REGION", async () => {
    stubRequiredEnv({ AWS_REGION: undefined });

    await expect(importEnv()).rejects.toThrow("AWS_REGION");
  });

  it("defaults the S3 prefix to an empty string", async () => {
    stubRequiredEnv({ KNOWLEDGE_BASE_S3_PREFIX: undefined });

    const { env } = await importEnv();

    expect(env.KNOWLEDGE_BASE_S3_PREFIX).toBe("");
  });

});
