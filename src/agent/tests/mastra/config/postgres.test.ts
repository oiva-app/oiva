import { describe, expect, it } from "vitest";
import { createPostgresConnectionConfig } from "@/config/postgres";

describe("createPostgresConnectionConfig", () => {
  it("returns a pg config object from split Postgres variables", () => {
    expect(
      createPostgresConnectionConfig({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva",
        POSTGRES_PASSWORD: "oiva_dev",
        POSTGRES_DB: "oiva",
      }),
    ).toEqual({
      host: "localhost",
      port: 5433,
      user: "oiva",
      password: "oiva_dev",
      database: "oiva",
    });
  });

  it("rejects DATABASE_URL", () => {
    expect(() =>
      createPostgresConnectionConfig({
        DATABASE_URL: "postgresql://oiva:oiva_dev@localhost:5433/oiva",
      }),
    ).toThrow(
      "DATABASE_URL is unsupported; use POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB",
    );
  });

  it("rejects DATABASE_URL when split variables are also present", () => {
    expect(() =>
      createPostgresConnectionConfig({
        DATABASE_URL: "postgresql://url:user@db.example.com:5432/from_url",
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva",
        POSTGRES_PASSWORD: "oiva_dev",
        POSTGRES_DB: "oiva",
      }),
    ).toThrow("DATABASE_URL is unsupported");
  });

  it("fails when split Postgres variables are incomplete", () => {
    expect(() =>
      createPostgresConnectionConfig({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva",
      }),
    ).toThrow("Provide all split Postgres variables. Missing: POSTGRES_PASSWORD, POSTGRES_DB");
  });

  it("rejects a non-numeric Postgres port", () => {
    expect(() =>
      createPostgresConnectionConfig({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "not-a-port",
        POSTGRES_USER: "oiva",
        POSTGRES_PASSWORD: "oiva_dev",
        POSTGRES_DB: "oiva",
      }),
    ).toThrow("POSTGRES_PORT must be an integer from 1 to 65535");
  });

  it("rejects an out-of-range Postgres port", () => {
    expect(() =>
      createPostgresConnectionConfig({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "65536",
        POSTGRES_USER: "oiva",
        POSTGRES_PASSWORD: "oiva_dev",
        POSTGRES_DB: "oiva",
      }),
    ).toThrow("POSTGRES_PORT must be an integer from 1 to 65535");
  });
});
