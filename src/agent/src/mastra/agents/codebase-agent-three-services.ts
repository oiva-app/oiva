import { Agent } from "@mastra/core/agent";
import type { SubAgent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { ToolCallFilter } from '@mastra/core/processors';
import { env } from "../config/env";
import { cbAgentThreeServicesDemoWorkspace } from "../workspaces/codebase-workspace-three-services";
import { prompt } from "../prompts/system-prompt-codebase-three-services";
import { investigationSchema } from "../memory/investigation-schema";

export const threeServicesCodebaseInvestigator: SubAgent = new Agent({
  id: "codebase-investigator",
  name: "Codebase Investigator",
  description:
    "Investigates the codebase by looking for bugs in relevant services and checking deployment history.",
  instructions: prompt,
  defaultOptions: {
    maxSteps: env.CODEBASE_MAX_STEPS,
  },
  memory: new Memory({
    options: {
      lastMessages: 20,
      workingMemory: {
        enabled: true,
        schema: investigationSchema,
      },
    },
  }),
  inputProcessors: [
     new ToolCallFilter({ filterAfterToolSteps: 3 })
  ],
  model: "openai/gpt-5.4",
  workspace: cbAgentThreeServicesDemoWorkspace,
});
