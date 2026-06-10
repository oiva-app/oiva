export interface PostgresConfigInput {
  DATABASE_URL?: string;
  POSTGRES_HOST?: string;
  POSTGRES_PORT?: string;
  POSTGRES_USER?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DB?: string;
}

export interface PostgresConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const requiredSplitKeys = [
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;

export const createPostgresConnectionConfig = (
  input: PostgresConfigInput,
): PostgresConnectionConfig => {
  if (input.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is unsupported; use POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB",
    );
  }

  const missing = requiredSplitKeys.filter((key) => !input[key]);
  if (missing.length > 0) {
    throw new Error(
      `Provide all split Postgres variables. Missing: ${missing.join(", ")}`,
    );
  }

  const port = Number(input.POSTGRES_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("POSTGRES_PORT must be an integer from 1 to 65535");
  }

  const host = input.POSTGRES_HOST as string;
  const user = input.POSTGRES_USER as string;
  const password = input.POSTGRES_PASSWORD as string;
  const database = input.POSTGRES_DB as string;

  return {
    host,
    port,
    user,
    password,
    database,
  };
};
