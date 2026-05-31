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
  /**
    Insert a new alert. If a row with the same (source, vendor_instance_id) already exists, returns the existing row — webhook retries are idempotent at this layer (the UNIQUE constraint enforces it at the DB).
  */
  insert(input: InsertAlertInput): Promise<Alert>;
  firstReceivedAt(incidentId: string): Promise<Date | null>;
  findByVendorInstanceId(
    source: string,
    vendorInstanceId: string,
  ): Promise<Alert | null>;
  attachToIncident(alertId: string, incidentId: string): Promise<void>;
}
