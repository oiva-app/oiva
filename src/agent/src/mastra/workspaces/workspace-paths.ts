import path from "node:path";

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

export function getContainedClonePath(
  codebaseRoot: string,
  repositoryName: string,
) {
  const resolvedCodebaseRoot = path.resolve(codebaseRoot);
  const clonePath = path.resolve(path.join(codebaseRoot, repositoryName));

  if (
    clonePath === resolvedCodebaseRoot ||
    !clonePath.startsWith(`${resolvedCodebaseRoot}${path.sep}`)
  ) {
    throw new Error(`Repository name escapes codebase root: ${repositoryName}`);
  }

  return clonePath;
}
