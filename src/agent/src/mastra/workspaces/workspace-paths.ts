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
