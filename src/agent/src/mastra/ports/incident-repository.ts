/**
 * IncidentRepository — port.
 *
 * Domain types + interface that adapters implement.
 * Workflow steps depend on this interface, never on the Postgres adapter directly.
 * Pure TS + zod. No Postgres, no Mastra imports here.
 */
import * as z from "zod";

export const IncidentStatusSchema = z.enum([
  "triggered",
  "investigating",
  "report_generating",
  "reported",
  "closed",
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentSchema = z.object({
  id: z.string().uuid(),
  status: IncidentStatusSchema,
  createdAt: z.date(),
  resolvedAt: z.date().nullable(),
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
  /**
   * Returns active incidents whose latest alert tuple matches (triggerName, dataset, queryId) and arrived after `since`.
   * Used by the correlation step in the workflow.
   */
  findActiveCandidates(opts: CorrelationLookup): Promise<Incident[]>;
}
