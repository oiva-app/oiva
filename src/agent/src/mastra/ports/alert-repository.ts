import * as z from "zod";

export const AlertSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid().nullable(),
  receivedAt: z.date(),
  rawPayload: z.unknown(),
  source: z.string(),
  vendorInstanceId: z.string().nullable(),
  triggerName: z.string().nullable(),
  dataset: z.string().nullable(),
  queryId: z.string().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;

export interface InsertAlertInput {
  source: string;
  vendorInstanceId?: string;
  rawPayload: unknown;
  triggerName?: string;
  dataset?: string;
  queryId?: string;
}

export interface AlertRepository {
  insert(input: InsertAlertInput): Promise<Alert>;
  firstReceivedAt(incidentId: string): Promise<Date | null>;
  findByVendorInstanceId(
    source: string,
    vendorInstanceId: string,
  ): Promise<Alert | null>;
  attachToIncident(alertId: string, incidentId: string): Promise<void>;
  findFirstByIncident(incidentId: string): Promise<Alert | null>;
}
