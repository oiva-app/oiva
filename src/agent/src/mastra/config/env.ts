/**
  This module assumes that the environment is loaded via 
  Vite's built-in .env support.

  Only environment vars prefixed with the value of PREFIX (see below) 
  will be imported.

  Inspiration: 
  https://github.com/alan2207/bulletproof-react/blob/master/apps/react-vite/src/config/env.ts
 */

import dotenv from 'dotenv'

dotenv.config({path: ".env", override: true});

import * as z from "zod"

const createEnv = () => {
  const EnvSchema = z.object({
    OPENAI_API_KEY: z.string(),
    HONEYCOMB_MCP_KEY: z.string(),
  })

  const parsedEnv = EnvSchema.safeParse(process.env)

  if (!parsedEnv.success) {
    throw new Error(
      `Invalid env provided.
The following variables are missing or invalid:
${Object.entries(parsedEnv.error.flatten().fieldErrors)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`
    )
  }

  return parsedEnv.data
}

const parsed = createEnv()

export const env = {
  ...parsed,
}

console.log("Loaded environment using dotenv.")
// console.log(env)
