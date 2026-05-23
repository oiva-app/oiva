import { Agent } from "@mastra/core/agent";
import { prompt } from "../prompts/system-prompt-report-agent";
import { Memory } from "@mastra/memory";
import { env } from "../config/env"


export const reportAgent = new Agent({
  id: "report-agent",
  name: "Report Agent",
  instructions: prompt,
  memory: new Memory(),
  model: "openai/gpt-5.4",
  defaultOptions: {
    maxSteps: env.REPORT_MAX_STEPS,
  },
});
