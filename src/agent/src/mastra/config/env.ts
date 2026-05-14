/**
  This module centralizes environment variable loading and validation using zod.
  It ensures that all required variables are present at startup.
 */

import dotenv from "dotenv";
import path from "node:path";

// mastra dev/build/start runs with CWD = src/agent/, so the repo root is two levels up.
const rootEnv = path.resolve(process.cwd(), "../../.env");

dotenv.config({ path: rootEnv, override: true });

import * as z from "zod";

/**
 * Checks the env that's required for the agent and NOT every entry in the .env file
 */
const createEnv = () => {
  const EnvSchema = z.object({
    OPENAI_API_KEY: z.string(),
    HC_MCP_KEY: z.string(),
  });

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
