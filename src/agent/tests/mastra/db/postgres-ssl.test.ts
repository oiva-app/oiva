import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

import {
  createPostgresSslConfig,
  parsePostgresSslNodeEnv,
} from "@/db/postgres-ssl";

describe("postgres SSL config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults an unset NODE_ENV to production", () => {
    expect(parsePostgresSslNodeEnv(undefined)).toBe("production");
  });

  it("accepts production and development NODE_ENV values", () => {
    expect(parsePostgresSslNodeEnv("production")).toBe("production");
    expect(parsePostgresSslNodeEnv("development")).toBe("development");
  });

  it("rejects invalid NODE_ENV values", () => {
    expect(() => parsePostgresSslNodeEnv("prod")).toThrow(
      'NODE_ENV must be "development" or "production"; got "prod"',
    );
  });

  it("does not configure SSL in development", async () => {
    vi.resetModules();
    const readFileSync = vi.spyOn(fs, "readFileSync");
    const { createPostgresSslConfig } = await import(
      "../../../src/mastra/db/postgres-ssl"
    );

    expect(createPostgresSslConfig("development")).toBeUndefined();
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it("configures the RDS CA bundle in production", async () => {
    vi.resetModules();
    const readFileSync = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("test-ca-bundle");
    const { createPostgresSslConfig } = await import(
      "../../../src/mastra/db/postgres-ssl"
    );

    expect(createPostgresSslConfig("production")).toEqual({
      ca: "test-ca-bundle",
    });
    expect(readFileSync).toHaveBeenCalledWith(
      "/etc/ssl/certs/rds-global-bundle.pem",
      "utf8",
    );
  });

  it("caches the RDS CA bundle in production", async () => {
    vi.resetModules();
    const readFileSync = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("test-ca-bundle");
    const { createPostgresSslConfig } = await import(
      "../../../src/mastra/db/postgres-ssl"
    );

    expect(createPostgresSslConfig("production")).toEqual({
      ca: "test-ca-bundle",
    });
    expect(createPostgresSslConfig("production")).toEqual({
      ca: "test-ca-bundle",
    });
    expect(readFileSync).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when the RDS CA bundle cannot be read", async () => {
    vi.resetModules();
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });
    const { createPostgresSslConfig } = await import(
      "../../../src/mastra/db/postgres-ssl"
    );

    expect(() => createPostgresSslConfig("production")).toThrow(
      "Failed to read RDS CA bundle at /etc/ssl/certs/rds-global-bundle.pem. Ensure the file is present in production: ENOENT: no such file or directory",
    );
  });
});
