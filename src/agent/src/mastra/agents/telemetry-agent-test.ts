import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import type { SubAgent } from "@mastra/core/agent";
import { investigationToolWrapper } from "@/tools/investigation-tool-wrapper";

import {
  honeycomb_get_workspace_context,
  honeycomb_get_dataset,
  honeycomb_run_query,
  honeycomb_run_bubbleup,
  honeycomb_get_query_results,
  honeycomb_get_trace,
  honeycomb_find_columns,
  honeycomb_analyze_columns,
} from "../mcp/mcpClients";

const toolsToWrap = {
  // enrichAlertTool,
  honeycomb_get_workspace_context,
  // honeycomb_get_dataset,
  // honeycomb_run_query,
  // honeycomb_run_bubbleup,
  // honeycomb_get_query_results,
  // honeycomb_get_trace,
  // honeycomb_find_columns,
  // honeycomb_analyze_columns,
}

const wrapped = {}
for (let [key, value] of Object.entries(toolsToWrap)) {
  wrapped[key] = investigationToolWrapper(value)
}

export const telemetryAgent: SubAgent = new Agent({
  id: "test-agent",
  name: "Telemetry Agent",
  description:
    "Investigates telemetry data from Honeycomb by exploring datasets, running queries, comparing anomalies against baselines and retrieving traces.",
  instructions: "Please use this tool",
  model: "openai/gpt-5.4",
  defaultOptions: {
    maxSteps: 2,
  },
  tools: { ...wrapped },
  memory: new Memory(),
});
