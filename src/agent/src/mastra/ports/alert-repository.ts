import type { Alert } from "@/domain/alert";

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
