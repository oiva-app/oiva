import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { env } from "../config/env";


const supervisorFilesystem = new LocalFilesystem({
    basePath: env.SUPERVISOR_WORKSPACE_PATH,
    readOnly: true,
  });

export const supervisorWorkspace = new Workspace({
  filesystem: supervisorFilesystem,
  bm25: true,
});

supervisorWorkspace.init();
