import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import { env } from "../config/env";

const cbAgentTFilesystem = new LocalFilesystem({
    basePath: env.CODEBASE_AGENT_WORKSPACE_PATH,
  });

export const cbAgentThreeServicesDemoWorkspace = new Workspace({
  filesystem: cbAgentTFilesystem,
  sandbox: new LocalSandbox({ 
    workingDirectory: env.CODEBASE_AGENT_SANDBOX_PATH, 
  }),
  lsp: true,
  bm25: true
});

cbAgentThreeServicesDemoWorkspace.init();
