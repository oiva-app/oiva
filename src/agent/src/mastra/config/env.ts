/**
  This module centralizes environment variable loading and validation using zod.
  It ensures that all required variables are present at startup.
 */

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import * as z from "zod";

const EnvSchema = z.object({
  OPENAI_API_KEY: z.string(),
  HC_MCP_KEY: z.string(),
  COLLECTOR_ENDPOINT: z.string(),
  GITHUB_PAT: z.string(),

  //  Unset = no secret enforcement on incoming webhooks.  Only for development.
  HC_SHARED_SECRET: z.string().optional(),

  // Reduce max steps to save tokens
  SUPERVISOR_MAX_STEPS: z.coerce.number().default(30),
  TELEMETRY_MAX_STEPS: z.coerce.number().default(20),
  CODEBASE_MAX_STEPS: z.coerce.number().default(20),
  RUN_EVALS: z.stringbool().default(true), // `false` to save tokens

  // for future use - for implementing development-only logic
  NODE_ENV: z.enum(["development", "production"]).default("production"),
});

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
