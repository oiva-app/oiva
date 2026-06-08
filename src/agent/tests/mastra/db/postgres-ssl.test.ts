import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

import {
  createPostgresSslConfig,
  parsePostgresSslNodeEnv,
} from "../../../src/mastra/db/postgres-ssl";

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

  it("does not configure SSL in development", () => {
    expect(createPostgresSslConfig("development")).toBeUndefined();
  });

  it("configures the RDS CA bundle in production", () => {
    const readFileSync = vi
      .spyOn(fs, "readFileSync")
      .mockReturnValue("test-ca-bundle");

    expect(createPostgresSslConfig("production")).toEqual({
      ca: "test-ca-bundle",
    });
    expect(readFileSync).toHaveBeenCalledWith(
      "/etc/ssl/certs/rds-global-bundle.pem",
      "utf8",
    );
  });
});
