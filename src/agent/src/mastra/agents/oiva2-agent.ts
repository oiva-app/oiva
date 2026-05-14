import { MCPClient } from "@mastra/mcp";
import { Agent } from "@mastra/core/agent";
import { env } from "../config/env";
import { readFileSync } from "node:fs";
import { join } from "path";

// npm install @mastra/mcp@latest
export const testMcpClient = new MCPClient({
  id: "test-mcp-client",
  servers: {
    honeycomb: {
      url: new URL("https://mcp.honeycomb.io/mcp"),
      requestInit: {
        headers: {
          Authorization: `Bearer ${env.HC_MCP_KEY}`,
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

const systemPrompt = readFileSync(
  join(import.meta.dirname, "../../prompts/system-prompt.md"),
  "utf-8",
);

export const oiva2 = new Agent({
  id: "oiva-v0.0.2",
  name: "Oiva v0.0.2",
  instructions: systemPrompt,
  model: "openai/gpt-5.4",
  tools: honeycombSelectFew, // https://mastra.ai/docs/mcp/overview#using-mcpclient-with-an-agent
});
