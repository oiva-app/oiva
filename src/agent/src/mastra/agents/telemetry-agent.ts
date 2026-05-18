import { Agent } from "@mastra/core/agent";
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
import { telemetryPrompt } from "../prompts/telemetry-prompt";

export const telemetryAgent = new Agent({
  id: "telemetry-agent",
  name: "Telemetry Agent",
  instructions: telemetryPrompt,
  model: "openai/gpt-5.4",
  tools: {
    honeycomb_get_workspace_context,
    honeycomb_get_dataset,
    honeycomb_run_query,
    honeycomb_run_bubbleup,
    honeycomb_get_query_results,
    honeycomb_get_trace,
    honeycomb_find_columns,
    honeycomb_analyze_columns,
  },
});
