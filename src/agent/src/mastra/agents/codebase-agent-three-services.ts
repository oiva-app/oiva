import { Agent } from "@mastra/core/agent";
import type { SubAgent } from "@mastra/core/agent";
import { prompt } from "../prompts/system-prompt-codebase-three-services";
import { Memory } from "@mastra/memory";
import { env } from "../config/env"
import { cbAgentThreeServicesDemoWorkspace } from "../workspaces/codebase-three-services";

export const threeServicesCodebaseInvestigator: SubAgent = new Agent({
  id: "codebase-investigator",
  name: "Codebase Investigator",
  description:
    "Investigates the codebase by looking for bugs in relevant services and checking deployment history.",
  instructions: prompt,
  defaultOptions: {
    maxSteps: env.CODEBASE_MAX_STEPS,
  },
  memory: new Memory(),
  model: "openai/gpt-5.4",
  workspace: cbAgentThreeServicesDemoWorkspace,
});
