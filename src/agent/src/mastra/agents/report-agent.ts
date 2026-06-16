import { Agent } from "@mastra/core/agent";
import { env } from "@/config/env";
import { prompt } from "@/prompts/report-agent-prompt";

export const reportAgent = new Agent({
  id: "report-agent",
  name: "Report Agent",
  instructions: prompt,
  model: env.REPORT_AGENT_MODEL,
});
