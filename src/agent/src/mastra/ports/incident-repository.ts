import type { Incident, IncidentStatus } from "@/domain/incident";

export interface CorrelationLookup {
  triggerName: string;
  dataset: string;
  queryId: string;
  since: Date;
}

export interface IncidentRepository {
  create(input?: { status?: IncidentStatus }): Promise<Incident>;
  findById(id: string): Promise<Incident | null>;
  updateStatus(id: string, next: IncidentStatus): Promise<Incident>;
  closeIfOpen(id: string): Promise<boolean>;
  persistLiveUpdateSnapshot(id: string, snapshot: unknown): Promise<void>;
  getLiveUpdateSnapshot(id: string): Promise<unknown>;
  findActiveCandidates(opts: CorrelationLookup): Promise<Incident[]>;
  attachSlackThread(
    id: string,
    slack: { slackThreadTs: string; slackChannelId: string },
  ): Promise<void>;
  findStaleIncidents(opts: {
    statuses: IncidentStatus[];
    updatedBefore: Date;
  }): Promise<Incident[]>;
}
