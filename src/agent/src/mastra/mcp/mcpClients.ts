import { MCPClient } from "@mastra/mcp";
import { env } from "../config/env";
import { investigationToolWrapper } from "@/tools/investigation-tool-wrapper";
import { Tool } from "@mastra/core/tools";

export const mvpMcpClient = new MCPClient({
  id: "honeycomb-mcp-client",
  servers: {
    honeycomb: {
      url: new URL("https://mcp.honeycomb.io/mcp"),
      requestInit: {
        headers: {
          Authorization: `Bearer ${env.HC_MCP_KEY}`,
        },
      },
    },
    github: {
      url: new URL("https://api.githubcopilot.com/mcp/"),
      requestInit: {
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
        },
      },
    },
  },
});

export const {
  github_list_releases,
  github_get_latest_release,
  github_get_repository_tree,
  github_get_file_contents,
  github_search_code,
  github_list_commits,
  github_get_commit,
  github_list_pull_requests,
  github_search_pull_requests,
  github_get_pull_request,
  github_pull_request_read,
  github_list_workflow_runs,
  github_get_workflow_run,
  github_get_workflow_run_logs,
  honeycomb_get_workspace_context,
  honeycomb_get_dataset,
  honeycomb_run_query,
  honeycomb_run_bubbleup,
  honeycomb_get_query_results,
  honeycomb_get_trace,
  honeycomb_find_columns,
  honeycomb_analyze_columns,  // TODO -this is a deprecated or fake tool name?
} = await mvpMcpClient.listTools();

const honeycombToolsToWrap = {
  honeycomb_get_workspace_context,
  honeycomb_get_dataset,
  honeycomb_run_query,
  honeycomb_run_bubbleup,
  // honeycomb_get_query_results,  // omitted here because the agent doesn't seem to know how to properly use this tool, and the enrichAlert tool does everything that the agent needs?
  honeycomb_get_trace,
  honeycomb_find_columns,
  honeycomb_analyze_columns,
};

function wrapTools(tools: Record<string, Tool<any, any> | undefined>) {
  const wrappedTools: Record<string, ReturnType<typeof investigationToolWrapper>> = {};
  for (const [key, tool] of Object.entries(tools)) {
    if (!tool) {
      console.warn(`[mcpClients] skipping wrap: "${key}" not provided by MCP server`);
      continue;
    }
    wrappedTools[key] = investigationToolWrapper(tool);
  }
  return wrappedTools;
}

export const wrappedHoneycombTools = wrapTools(honeycombToolsToWrap)
