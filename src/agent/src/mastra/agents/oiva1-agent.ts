import { MCPClient } from "@mastra/mcp";
import { Agent } from "@mastra/core/agent";
import { env } from "../config/env";

// npm install @mastra/mcp@latest
export const testMcpClient = new MCPClient({
  id: "test-mcp-client",
  servers: {
    honeycomb: {
      // Valerie's ref -> https://docs.google.com/document/d/1rkxXoChttbApF2_3bfaym_XkJt4I-XEJq5WRpZyXjig/edit?tab=t.0
      url: new URL("https://mcp.honeycomb.io/mcp"),
      requestInit: {
        headers: {
          Authorization: `Bearer ${env.HONEYCOMB_MCP_KEY}`,
        },
      },
    },
  },
});

// https://mastra.ai/docs/mcp/overview#static-tools
const {
  honeycomb_get_workspace_context,
  honeycomb_get_dataset,
  honeycomb_run_query,
  honeycomb_run_bubbleup,
  honeycomb_get_query_results,
  honeycomb_get_trace,
} = await testMcpClient.listTools();

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
