import type { Pool } from "pg";
import type {
  Alert,
  AlertRepository,
  InsertAlertInput,
} from "../ports/alert-repository";

export class PgAlertRepository implements AlertRepository {
  constructor(private readonly pool: Pool) {}

  insert(_input: InsertAlertInput): Promise<Alert> {
    throw new Error("PgAlertRepository.insert not implemented");
  }

  findByVendorInstanceId(
    _source: string,
    _vendorInstanceId: string,
  ): Promise<Alert | null> {
    throw new Error("PgAlertRepository.findByVendorInstanceId not implemented");
  }

  attachToIncident(_alertId: string, _incidentId: string): Promise<void> {
    throw new Error("PgAlertRepository.attachToIncident not implemented");
  }
}
