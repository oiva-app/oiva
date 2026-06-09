/**
  This module centralizes environment variable loading and validation using zod.
  It ensures that all required variables are present at startup.
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import * as z from "zod";
import { createPostgresConnectionConfig } from "./postgres";

const GitHubRepositorySchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/, {
      message:
        "must contain only letters, numbers, periods, underscores, and hyphens",
    })
    .refine((name) => name !== "." && name !== "..", {
      message: "must not be '.' or '..'",
    }),
  url: z.url(),
});

const GitHubRepositoriesEnvSchema = z
  .string()
  .transform((value, ctx) => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "must be valid JSON",
      });
      return z.NEVER;
    }

    const repositories = z
      .array(GitHubRepositorySchema)
      .min(1, "must contain at least one repository")
      .safeParse(parsed);

    if (!repositories.success) {
      ctx.addIssue({
        code: "custom",
        message: repositories.error.issues
          .map((issue) => issue.message)
          .join("; "),
      });
      return z.NEVER;
    }

    const names = new Set<string>();
    const duplicate = repositories.data.find((repository) => {
      if (names.has(repository.name)) return true;
      names.add(repository.name);
      return false;
    });

    if (duplicate) {
      ctx.addIssue({
        code: "custom",
        message: `contains duplicate repository name: ${duplicate.name}`,
      });
      return z.NEVER;
    }

    return repositories.data;
  });

const EnvSchema = z
  .object({
    OBSERVED_APP_NAME: z.string(),
    OPENAI_API_KEY: z.string(),
    HC_MCP_KEY: z.string(),
    COLLECTOR_ENDPOINT: z.string(),
    GITHUB_PAT: z.string(),
    APP_GITHUB_REPOSITORIES: GitHubRepositoriesEnvSchema,

    // Optional in development (no webhook auth). REQUIRED in production.
    HC_SHARED_SECRET: z.string().optional(),

    // Reduce max steps to save tokens
    SUPERVISOR_MAX_STEPS: z.coerce.number().default(30),
    SUBAGENT_MAX_STEPS: z.coerce.number().default(20),
    TELEMETRY_MAX_STEPS: z.coerce.number().default(20),
    CODEBASE_MAX_STEPS: z.coerce.number().default(20),
    RUN_EVALS: z.stringbool().default(true), // `false` to save tokens

    // Gates HC_SHARED_SECRET enforcement (see .refine below). Defaults to
    // "production" so an unset value fails closed.
    NODE_ENV: z.enum(["development", "production"]).default("production"),

    // Knowledge base source in S3. Local per-incident mirrors are created under
    // /tmp/workspaces by the workspace layer.
    KNOWLEDGE_BASE_S3_BUCKET: z.string(),
    KNOWLEDGE_BASE_S3_PREFIX: z.string(),
    AWS_REGION: z.string(),

    // for slack integration
    SLACK_BOT_TOKEN: z.string(),
    SLACK_CHANNEL_ID: z.string(),
    SLACK_SIGNING_SECRET: z.string(),

    /*
      mcp integration testing
        Only set to true if 'HC_MCP_KEY' points at a valid MCP key for the `oiva-sv` team 
    */
    RUN_OIVA_SV_MCP_INTEGRATION_TESTS: z.stringbool().default(false),

    // Postgres connection. DATABASE_URL is intentionally unsupported; use
    // split POSTGRES_* variables for local dev and deployment.
    DATABASE_URL: z.preprocess(
      (val) => (val === "" ? undefined : val),
      z.string().optional(),
    ),
    POSTGRES_HOST: z.string().optional(),
    POSTGRES_PORT: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_DB: z.string().optional(),
    CORRELATION_WINDOW_MINUTES: z.coerce.number().default(30),
    // Cleanup reaper thresholds (minutes). See services/reaper.ts.
    REAPER_DELIVERED_QUIET_MINUTES: z.coerce.number().default(1440),
    REAPER_FAILED_QUIET_MINUTES: z.coerce.number().default(1440), // 24h — keep the Retry button around for a day
    REAPER_STUCK_DEADLINE_MINUTES: z.coerce.number().default(60), // MUST exceed the slowest investigation (sweep 3 kills live-but-slow runs)
    REAPER_ENABLED: z.stringbool().default(false),
    REAPER_INTERVAL_MINUTES: z.coerce.number().default(10),
  })
  .refine(
    (env) => env.NODE_ENV !== "production" || Boolean(env.HC_SHARED_SECRET),
    {
      message:
        "HC_SHARED_SECRET is required when NODE_ENV=production (an unset NODE_ENV defaults to production). Set NODE_ENV=development to run webhooks without a shared secret.",
      path: ["HC_SHARED_SECRET"],
    },
  );

/**
 * Find the nearest .env file using a method that is compatible with Mastra bundling
 */
const findEnvUpward = (start: string): string | undefined => {
  let dir = start;
  while (true) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

const rootEnv = findEnvUpward(process.cwd());

if (rootEnv) {
  const dotenvResult = dotenv.config({ path: rootEnv });
  if (dotenvResult.parsed?.NODE_ENV) {
    process.env.NODE_ENV = dotenvResult.parsed.NODE_ENV;
  }
}

/**
 * Checks the env that's required for the agent and NOT every entry in the .env file
 */
const createEnv = () => {
  const parsedEnv = EnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error(
      `env.ts -> Invalid env provided.
The following variables are missing or invalid:
${Object.entries(parsedEnv.error.flatten().fieldErrors)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`,
    );
  }

  try {
    const postgresConfig = createPostgresConnectionConfig(parsedEnv.data);
    const {
      DATABASE_URL: _databaseUrl,
      POSTGRES_HOST: _postgresHost,
      POSTGRES_PORT: _postgresPort,
      POSTGRES_USER: _postgresUser,
      POSTGRES_PASSWORD: _postgresPassword,
      POSTGRES_DB: _postgresDb,
      ...envWithoutRawPostgres
    } = parsedEnv.data;

    return {
      ...envWithoutRawPostgres,
      POSTGRES_CONFIG: postgresConfig,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `env.ts -> Invalid env provided.
The following variables are missing or invalid:
- POSTGRES_CONFIG: ${message}
`,
    );
  }
};

const parsed = createEnv();

export const env = {
  ...parsed,
};

if (rootEnv) {
  console.log(`env.ts -> .env loaded from ${rootEnv}`);
} else {
  console.log("env.ts -> .env not found; using process environment");
}
