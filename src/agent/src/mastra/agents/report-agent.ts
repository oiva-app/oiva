import { Agent } from "@mastra/core/agent";
import { prompt } from "../prompts/system-prompt-report-agent";

export const reportAgent = new Agent({
  id: "report-agent",
  name: "Report Agent",
  instructions: prompt,
  model: "openai/gpt-4o-mini",
});
