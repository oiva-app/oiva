import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import type { SubAgent } from "@mastra/core/agent";
import { env } from "@/config/env"
import { enrichAlertTool } from "@/tools/alert-enrich";
import { wrappedHoneycombTools } from "@/mcp/mcpClients";
import { telemetryPrompt } from "@/prompts/telemetry-agent-prompt";

export const telemetryAgent: SubAgent = new Agent({
  id: "telemetry-agent",
  name: "Telemetry Agent",
  description:
    "Investigates telemetry data from Honeycomb by exploring datasets, running queries, comparing anomalies against baselines and retrieving traces.",
  instructions: telemetryPrompt,
  model: env.TELEMETRY_AGENT_MODEL,
  defaultOptions: {
    maxSteps: env.TELEMETRY_MAX_STEPS,
  },
  tools: {
    enrichAlertTool,
    ...wrappedHoneycombTools,
  },
  memory: new Memory(),
});
