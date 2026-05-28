import {
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
} from "../mcp/mcpClients";
import { Agent } from "@mastra/core/agent";
import type { SubAgent } from "@mastra/core/agent";
import { prompt } from "../prompts/system-prompt-codebase-investigator-gh-ver";
import { ObservationalMemory } from "@mastra/memory/processors";
import { Memory } from "@mastra/memory";
import { env } from "../config/env"

// https://github.com/github/github-mcp-server/blob/main/README.md#available-toolsets
const githubToolsSubset = {
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
};

export const codebaseInvestigator: SubAgent = new Agent({
  id: "codebase-investigator",
  name: "Codebase Investigator",
  description:
    "Investigates the codebase by looking for bugs in recent changes and checking deployment history.",
  instructions: prompt,
  defaultOptions: {
    maxSteps: env.CODEBASE_MAX_STEPS,
  },
  memory: new Memory(),
  model: "openai/gpt-5.4",
  tools: githubToolsSubset,
});
