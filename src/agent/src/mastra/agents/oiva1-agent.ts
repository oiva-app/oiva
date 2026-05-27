import { Agent } from "@mastra/core/agent";
import {
  honeycomb_get_workspace_context,
  honeycomb_get_dataset,
  honeycomb_run_query,
  honeycomb_run_bubbleup,
  honeycomb_get_query_results,
  honeycomb_get_trace,
} from "../mcp/mcpClients";

const honeycombSelectFew = {
  honeycomb_get_workspace_context,
  honeycomb_get_dataset,
  honeycomb_run_query,
  honeycomb_run_bubbleup,
  honeycomb_get_query_results,
  honeycomb_get_trace,
};

// const allTheTools = await testMcpClient.listTools();
// console.log(allTheTools)

// const tools = Object.fromEntries(
//   Object.entries(allTools).filter(
//     ([name]) => name !== "honeycomb_list_semconv_namespaces"
//   )
// );

export const helloWorldAgent = new Agent({
  id: "hello-world-agent",
  name: "Hello World Agent",
  instructions:
    "You are an extremely powerful AI-SRE Agent.  Please Examine this alert and query the Honeycomb MCP to determine the root cause of this alert",
  model: "openai/gpt-5.4",
  tools: honeycombSelectFew, // https://mastra.ai/docs/mcp/overview#using-mcpclient-with-an-agent
});
