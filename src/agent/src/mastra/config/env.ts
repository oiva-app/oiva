/**
  This module centralizes environment variable loading and validation using zod.
  It ensures that all required variables are present at startup.
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import * as z from "zod";

const EnvSchema = z
  .object({
    OBSERVED_APP_NAME: z.string(),
    OPENAI_API_KEY: z.string(),
    HC_MCP_KEY: z.string(),
    COLLECTOR_ENDPOINT: z.string(),
    GITHUB_PAT: z.string(),
    APP_GITHUB_HTTPS_URL: z.url(),

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

    // absolute paths to workspaces on the machine/container
    KNOWLEDGE_BASE_PATH: z.string(),
    SANDBOX_BASE_PATH: z.string(),

    // for slack integration
    SLACK_BOT_TOKEN: z.string(),
    SLACK_CHANNEL_ID: z.string(),
    SLACK_SIGNING_SECRET: z.string(),

    /*
      mcp integration testing
        Only set to true if 'HC_MCP_KEY' points at a valid MCP key for the `oiva-sv` team 
    */
    RUN_OIVA_SV_MCP_INTEGRATION_TESTS: z.stringbool().default(false),

    // postgres connection string (compose service: postgres).
    // Format: postgresql://<user>:<password>@<host>:<port>/<database>
    DATABASE_URL: z
      .string()
      .regex(
        /^postgres(ql)?:\/\//,
        "DATABASE_URL must be a postgres:// or postgresql:// connection string",
      ),
    CORRELATION_WINDOW_MINUTES: z.coerce.number().default(30),
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
if (!rootEnv) {
  throw new Error(`env.ts -> no .env file found upward from ${process.cwd()}`);
}

dotenv.config({ path: rootEnv, override: true });

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

  return parsedEnv.data;
};

const parsed = createEnv();

export const env = {
  ...parsed,
};

console.log("Loaded environment using dotenv.");
// console.log(env)
