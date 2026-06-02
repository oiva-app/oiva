import { describe, expect, it } from "vitest";
import { resolvePostgresDatabaseUrl } from "../../../src/mastra/config/postgres";

describe("resolvePostgresDatabaseUrl", () => {
  it("passes through DATABASE_URL when present", () => {
    expect(
      resolvePostgresDatabaseUrl({
        DATABASE_URL: "postgresql://oiva:oiva_dev@localhost:5433/oiva",
      }),
    ).toBe("postgresql://oiva:oiva_dev@localhost:5433/oiva");
  });

  it("builds DATABASE_URL from split Postgres variables", () => {
    expect(
      resolvePostgresDatabaseUrl({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva",
        POSTGRES_PASSWORD: "oiva_dev",
        POSTGRES_DB: "oiva",
      }),
    ).toBe("postgresql://oiva:oiva_dev@localhost:5433/oiva");
  });

  it("prefers DATABASE_URL when both config shapes are present", () => {
    expect(
      resolvePostgresDatabaseUrl({
        DATABASE_URL: "postgresql://url:user@db.example.com:5432/from_url",
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva",
        POSTGRES_PASSWORD: "oiva_dev",
        POSTGRES_DB: "oiva",
      }),
    ).toBe("postgresql://url:user@db.example.com:5432/from_url");
  });

  it("fails when split Postgres variables are incomplete", () => {
    expect(() =>
      resolvePostgresDatabaseUrl({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva",
      }),
    ).toThrow(
      "Provide DATABASE_URL or all split Postgres variables. Missing: POSTGRES_PASSWORD, POSTGRES_DB",
    );
  });

  it("encodes userinfo and database name from split variables", () => {
    expect(
      resolvePostgresDatabaseUrl({
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "oiva user",
        POSTGRES_PASSWORD: "p@ss/word",
        POSTGRES_DB: "oiva/dev",
      }),
    ).toBe(
      "postgresql://oiva%20user:p%40ss%2Fword@localhost:5433/oiva%2Fdev",
    );
  });
});
