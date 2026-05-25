import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';

const cbAgentTFilesystem = new LocalFilesystem({
    basePath: './workspaces/codebase-agent',
  });

const supervisorFilesystem = new LocalFilesystem({
    basePath: './workspaces/supervisor'
  });

export const cbAgentThreeServicesDemoWorkspace = new Workspace({
  filesystem: cbAgentTFilesystem,
  sandbox: new LocalSandbox({ 
    workingDirectory: './workspaces/codebase-agent/codebase', 
  }),
  lsp: true,
  bm25: true
});

export const supervisorThreeServicesDemoWorkspace = new Workspace({
  filesystem: supervisorFilesystem,
  bm25: true
});

cbAgentThreeServicesDemoWorkspace.init()
supervisorThreeServicesDemoWorkspace.init();

async function checkPaths() {
  console.log(await cbAgentTFilesystem.exists('knowledge-base/ARCHITECTURE.md'));
  console.log(await supervisorFilesystem.exists('knowledge-base/ARCHITECTURE.md'))

}

checkPaths();
