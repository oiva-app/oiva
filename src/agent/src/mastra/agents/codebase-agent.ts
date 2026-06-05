import { Agent } from "@mastra/core/agent";
import type { SubAgent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { ToolCallFilter } from '@mastra/core/processors';
import { env } from "../config/env";
import { getWrappedCodebaseTools } from "../workspaces/codebase-workspace";
import { prompt } from "../prompts/system-prompt-codebase-agent-ws-ver";
import { investigationSchema } from "../memory/investigation-schema";

export const codebaseAgent: SubAgent = new Agent({
  id: "codebase-agent",
  name: "Codebase Agent",
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
        scope: "thread",
        schema: investigationSchema,
      },
    },
  }),
  inputProcessors: [
     new ToolCallFilter({
      filterAfterToolSteps: 8,
      preserveModelOutput: true,
    }),
  ],
  model: "openai/gpt-5.4",
  tools: getWrappedCodebaseTools,
});
