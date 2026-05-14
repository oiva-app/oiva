/**
  This module centralizes environment variable loading and validation using zod.
  It ensures that all required variables are present at startup.
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env", override: true });

import * as z from "zod";

const createEnv = () => {
  const EnvSchema = z.object({
    OPENAI_API_KEY: z.string(),
    HC_MCP_KEY: z.string(),
  });

  const parsedEnv = EnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error(
      `Invalid env provided.
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
