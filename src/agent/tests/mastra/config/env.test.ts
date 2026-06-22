import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const originalCwd = process.cwd();
let testRoot: string;

const requiredEnv = {
  OBSERVED_APP_NAME: "orders-api",
  HONEYCOMB_MCP_KEY: "hc-mcp-key",
  COLLECTOR_ENDPOINT: "http://localhost:4318/v1/traces",
  GITHUB_PAT: "github-token",
  APP_GITHUB_REPOSITORIES: JSON.stringify([
    { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
  ]),
  NODE_ENV: "development",
  KNOWLEDGE_BASE_S3_BUCKET: "test-bucket",
  KNOWLEDGE_BASE_S3_PREFIX: "test-prefix",
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
    expect(env.APP_GITHUB_REPOSITORIES).toEqual([
      { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
    ]);
    expect(env.POSTGRES_CONFIG).toEqual({
      host: "localhost",
      port: 5432,
      user: "oiva",
      password: "password",
      database: "oiva",
    });
    expect(env.SUPERVISOR_AGENT_MODEL).toBe("openai/gpt-5.4");
    expect(env.TELEMETRY_AGENT_MODEL).toBe("openai/gpt-5.4");
    expect(env.CODEBASE_AGENT_MODEL).toBe("openai/gpt-5.4");
    expect(env.REPORT_AGENT_MODEL).toBe("openai/gpt-4o-mini");
    expect("OPENAI_API_KEY" in env).toBe(false);
    expect("DATABASE_URL" in env).toBe(false);
    expect("POSTGRES_HOST" in env).toBe(false);
    expect("POSTGRES_PORT" in env).toBe(false);
    expect("POSTGRES_USER" in env).toBe(false);
    expect("POSTGRES_PASSWORD" in env).toBe(false);
    expect("POSTGRES_DB" in env).toBe(false);
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

  it("uses NODE_ENV from .env over a stale parent process value", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await fs.writeFile(path.join(testRoot, ".env"), "NODE_ENV=development");

    const { env } = await importEnv();

    expect(env.NODE_ENV).toBe("development");
  });

  it("accepts configured Mastra router model ids", async () => {
    stubRequiredEnv({
      SUPERVISOR_AGENT_MODEL: "openai/gpt-4o-mini",
      TELEMETRY_AGENT_MODEL: "openai/gpt-5.4",
      CODEBASE_AGENT_MODEL: "openai/gpt-5.4-mini",
      REPORT_AGENT_MODEL: "openai/gpt-4o",
    });

    const { env } = await importEnv();

    expect(env.SUPERVISOR_AGENT_MODEL).toBe("openai/gpt-4o-mini");
    expect(env.TELEMETRY_AGENT_MODEL).toBe("openai/gpt-5.4");
    expect(env.CODEBASE_AGENT_MODEL).toBe("openai/gpt-5.4-mini");
    expect(env.REPORT_AGENT_MODEL).toBe("openai/gpt-4o");
  });

  it("accepts non-OpenAI and mixed-provider model ids without provider API keys", async () => {
    stubRequiredEnv({
      SUPERVISOR_AGENT_MODEL: "anthropic/claude-sonnet-4-5",
      TELEMETRY_AGENT_MODEL: "openai/gpt-5.4",
      CODEBASE_AGENT_MODEL: "google/gemini-2.5-pro",
      REPORT_AGENT_MODEL: "anthropic/claude-haiku-4-5",
    });

    const { env } = await importEnv();

    expect(env.SUPERVISOR_AGENT_MODEL).toBe("anthropic/claude-sonnet-4-5");
    expect(env.TELEMETRY_AGENT_MODEL).toBe("openai/gpt-5.4");
    expect(env.CODEBASE_AGENT_MODEL).toBe("google/gemini-2.5-pro");
    expect(env.REPORT_AGENT_MODEL).toBe("anthropic/claude-haiku-4-5");
  });

  it("rejects model ids that do not use Mastra router format", async () => {
    stubRequiredEnv({
      CODEBASE_AGENT_MODEL: "not-a-router-model",
    });

    await expect(importEnv()).rejects.toThrow("CODEBASE_AGENT_MODEL");
  });

  it("rejects model ids with empty router segments", async () => {
    stubRequiredEnv({
      SUPERVISOR_AGENT_MODEL: "openai//gpt-4o",
    });

    await expect(importEnv()).rejects.toThrow("SUPERVISOR_AGENT_MODEL");

    stubRequiredEnv({
      SUPERVISOR_AGENT_MODEL: "openai/gpt-4o/",
    });

    await expect(importEnv()).rejects.toThrow("SUPERVISOR_AGENT_MODEL");
  });

  it("requires the S3 bucket", async () => {
    stubRequiredEnv({ KNOWLEDGE_BASE_S3_BUCKET: undefined });

    await expect(importEnv()).rejects.toThrow("KNOWLEDGE_BASE_S3_BUCKET");
  });

  it("requires AWS_REGION", async () => {
    stubRequiredEnv({ AWS_REGION: undefined });

    await expect(importEnv()).rejects.toThrow("AWS_REGION");
  });

  it("requires APP_GITHUB_REPOSITORIES", async () => {
    stubRequiredEnv({ APP_GITHUB_REPOSITORIES: undefined });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("rejects invalid APP_GITHUB_REPOSITORIES JSON", async () => {
    stubRequiredEnv({ APP_GITHUB_REPOSITORIES: "not-json" });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("rejects an empty repository list", async () => {
    stubRequiredEnv({ APP_GITHUB_REPOSITORIES: "[]" });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("rejects invalid repository URLs", async () => {
    stubRequiredEnv({
      APP_GITHUB_REPOSITORIES: JSON.stringify([
        { name: "orders-api", url: "not-a-url" },
      ]),
    });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("rejects unsafe repository names", async () => {
    stubRequiredEnv({
      APP_GITHUB_REPOSITORIES: JSON.stringify([
        { name: "../orders-api", url: "https://github.com/acme/orders-api.git" },
      ]),
    });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("rejects current directory repository names", async () => {
    stubRequiredEnv({
      APP_GITHUB_REPOSITORIES: JSON.stringify([
        { name: ".", url: "https://github.com/acme/orders-api.git" },
      ]),
    });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("rejects parent directory repository names", async () => {
    stubRequiredEnv({
      APP_GITHUB_REPOSITORIES: JSON.stringify([
        { name: "..", url: "https://github.com/acme/orders-api.git" },
      ]),
    });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("accepts safe repository name punctuation", async () => {
    stubRequiredEnv({
      APP_GITHUB_REPOSITORIES: JSON.stringify([
        { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
        { name: "frontend.web", url: "https://github.com/acme/frontend.git" },
        { name: "worker_1", url: "https://github.com/acme/worker.git" },
      ]),
    });

    const { env } = await importEnv();

    expect(env.APP_GITHUB_REPOSITORIES.map((repository) => repository.name)).toEqual([
      "orders-api",
      "frontend.web",
      "worker_1",
    ]);
  });

  it("rejects duplicate repository names", async () => {
    stubRequiredEnv({
      APP_GITHUB_REPOSITORIES: JSON.stringify([
        { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
        { name: "orders-api", url: "https://github.com/acme/orders-worker.git" },
      ]),
    });

    await expect(importEnv()).rejects.toThrow("APP_GITHUB_REPOSITORIES");
  });

  it("does not require the old single repository URL", async () => {
    stubRequiredEnv({
      APP_GITHUB_HTTPS_URL: undefined,
    });

    const { env } = await importEnv();

    expect(env.APP_GITHUB_REPOSITORIES).toEqual([
      { name: "orders-api", url: "https://github.com/acme/orders-api.git" },
    ]);
    expect("APP_GITHUB_HTTPS_URL" in env).toBe(false);
  });

  it("requires the S3 prefix", async () => {
    stubRequiredEnv({ KNOWLEDGE_BASE_S3_PREFIX: undefined });

    await expect(importEnv()).rejects.toThrow("KNOWLEDGE_BASE_S3_PREFIX");
  });

  it("rejects DATABASE_URL", async () => {
    stubRequiredEnv({
      DATABASE_URL: "postgresql://oiva:password@localhost:5432/oiva",
    });

    await expect(importEnv()).rejects.toThrow(
      "DATABASE_URL is unsupported; use POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB",
    );
  });

  it("requires split Postgres variables", async () => {
    stubRequiredEnv({
      POSTGRES_PASSWORD: undefined,
      POSTGRES_DB: undefined,
    });

    await expect(importEnv()).rejects.toThrow(
      "Provide all split Postgres variables. Missing: POSTGRES_PASSWORD, POSTGRES_DB",
    );
  });
});
