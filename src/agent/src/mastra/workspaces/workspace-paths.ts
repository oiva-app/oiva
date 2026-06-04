import path from "node:path";

import { env } from "../config/env";

export const WORKSPACE_BASE_PATH = "/tmp/workspaces";

export function getWorkspaceRoot(incidentId: string) {
  return path.join(WORKSPACE_BASE_PATH, incidentId);
}

export function getKnowledgeBaseMirrorPath(incidentId: string) {
  return path.join(getWorkspaceRoot(incidentId), "knowledge-base");
}

export function getCodebaseRoot(incidentId: string) {
  return path.join(getWorkspaceRoot(incidentId), "codebase");
}

export function getCodebaseClonePath(incidentId: string) {
  return path.join(
    getCodebaseRoot(incidentId),
    getRepoName(env.APP_GITHUB_HTTPS_URL),
  );
}

function getRepoName(remoteUrl: string) {
  const pathname = new URL(remoteUrl).pathname;
  const repoName = path.basename(pathname).replace(/\.git$/, "");
  if (repoName.length === 0) {
    throw new Error(
      `Unable to derive repository name from APP_GITHUB_HTTPS_URL: ${remoteUrl}`,
    );
  }
  return repoName;
}
