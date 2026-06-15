import * as z from "zod";

export const IncidentStatusSchema = z.enum([
  "triggered",
  "investigating",
  "report_in_process",
  "report_generated",
  "report_delivered",
  "failed",
  "closed",
]);

export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentSchema = z.object({
  id: z.string().uuid(),
  status: IncidentStatusSchema,
  createdAt: z.date(),
  statusUpdated: z.date(),
  resolvedAt: z.date().nullable(),
  slackThreadTs: z.string().nullable(),
  slackChannelId: z.string().nullable(),
});
export type Incident = z.infer<typeof IncidentSchema>;

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
