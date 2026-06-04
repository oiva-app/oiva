import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import type { AnyWorkspace } from "@mastra/core/workspace";
import { RequestContext } from "@mastra/core/request-context";

import { getKnowledgeBaseMirrorPath } from "./workspace-paths";

const workspacesByIncidentId = new Map<string, AnyWorkspace>();
const inFlight = new Map<string, Promise<AnyWorkspace>>();

async function initSupervisorWorkspace(incidentId: string): Promise<AnyWorkspace> {
  const workspace = new Workspace({
    filesystem: new LocalFilesystem({
      basePath: getKnowledgeBaseMirrorPath(incidentId),
      readOnly: true,
    }),
  });
  await workspace.init();
  workspacesByIncidentId.set(incidentId, workspace);
  return workspace;
}

export function prepareSupervisorWorkspace(incidentId: string): Promise<AnyWorkspace> {
  if (!inFlight.has(incidentId)) {
    inFlight.set(incidentId, initSupervisorWorkspace(incidentId));
  }
  return inFlight.get(incidentId)!;
}

export async function cleanupSupervisorWorkspace(incidentId: string) {
  inFlight.delete(incidentId);
  const workspace = workspacesByIncidentId.get(incidentId);
  workspacesByIncidentId.delete(incidentId);

  try {
    await workspace?.destroy();
  } catch {
    // Continue cleanup even if workspace provider cleanup fails.
  }
}

export function getSupervisorWorkspace({
  requestContext,
}: {
  requestContext: RequestContext;
}) {
  const incidentId = requestContext.get("incidentId");
  if (typeof incidentId !== "string" || incidentId.length === 0) {
    throw new Error("getSupervisorWorkspace: incidentId missing from request context");
  }

  const workspace = workspacesByIncidentId.get(incidentId);
  if (!workspace) {
    throw new Error(
      `getSupervisorWorkspace: workspace not prepared for incidentId ${incidentId}`,
    );
  }

  return workspace;
}
