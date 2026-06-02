export interface PostgresConfigInput {
  DATABASE_URL?: string;
  POSTGRES_HOST?: string;
  POSTGRES_PORT?: string;
  POSTGRES_USER?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DB?: string;
}

const DATABASE_URL_PATTERN = /^postgres(ql)?:\/\//;

const requiredSplitKeys = [
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;

export const resolvePostgresDatabaseUrl = (
  input: PostgresConfigInput,
): string => {
  if (input.DATABASE_URL) {
    if (!DATABASE_URL_PATTERN.test(input.DATABASE_URL)) {
      throw new Error(
        "DATABASE_URL must be a postgres:// or postgresql:// connection string",
      );
    }

    return input.DATABASE_URL;
  }

  const missing = requiredSplitKeys.filter((key) => !input[key]);
  if (missing.length > 0) {
    throw new Error(
      `Provide DATABASE_URL or all split Postgres variables. Missing: ${missing.join(
        ", ",
      )}`,
    );
  }

  const host = input.POSTGRES_HOST as string;
  const port = input.POSTGRES_PORT as string;
  const user = encodeURIComponent(input.POSTGRES_USER as string);
  const password = encodeURIComponent(input.POSTGRES_PASSWORD as string);
  const database = encodeURIComponent(input.POSTGRES_DB as string);

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
};
