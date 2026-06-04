import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import type { SubAgent } from "@mastra/core/agent";
import { env } from "../config/env"
import { enrichAlertTool } from "@/tools/alert-enrich";
import { wrappedHoneycombTools } from "../mcp/mcpClients";
import { telemetryPrompt } from "../prompts/telemetry-prompt";

export const telemetryAgent: SubAgent = new Agent({
  id: "telemetry-agent",
  name: "Telemetry Agent",
  description:
    "Investigates telemetry data from Honeycomb by exploring datasets, running queries, comparing anomalies against baselines and retrieving traces.",
  instructions: telemetryPrompt,
  model: "openai/gpt-5.4",
  defaultOptions: {
    maxSteps: env.TELEMETRY_MAX_STEPS,
  },
  tools: {
    enrichAlertTool,
    ...wrappedHoneycombTools,
  },
  memory: new Memory(),
});
