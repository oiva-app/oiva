export interface KnowledgeBaseMirror {
  syncForIncident(incidentId: string): Promise<string>;
}
