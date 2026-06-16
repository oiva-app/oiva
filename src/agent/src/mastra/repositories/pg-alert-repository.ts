import type { Pool } from "pg";
import type { AlertRow } from "../db/types";
import type { Alert } from "@/domain/alert";
import type {
  AlertRepository,
  InsertAlertInput,
} from "../ports/alert-repository";

export class PgAlertRepository implements AlertRepository {
  constructor(private readonly pool: Pool) {}

  async insert(input: InsertAlertInput): Promise<Alert> {
    const { rows } = await this.pool.query<AlertRow>(
      `INSERT INTO alerts (
         source, vendor_instance_id, raw_payload,
         trigger_name, dataset, query_id
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (source, vendor_instance_id)
         WHERE vendor_instance_id IS NOT NULL
       DO UPDATE SET source = alerts.source
       RETURNING id, incident_id, received_at, raw_payload,
                 source, vendor_instance_id, trigger_name, dataset, query_id`,
      [
        input.source,
        input.vendorInstanceId ?? null,
        input.rawPayload,
        input.triggerName ?? null,
        input.dataset ?? null,
        input.queryId ?? null,
      ],
    );
    return this.toAlert(rows[0]);
  }

  async firstReceivedAt(incidentId: string): Promise<Date | null> {
    const { rows } = await this.pool.query<{ first_received_at: Date | null }>(
      `SELECT MIN(received_at) AS first_received_at
          FROM alerts
          WHERE incident_id = $1`,
      [incidentId],
    );
    return rows[0]?.first_received_at ?? null;
  }

  async findByVendorInstanceId(
    source: string,
    vendorInstanceId: string,
  ): Promise<Alert | null> {
    const { rows } = await this.pool.query<AlertRow>(
      `SELECT id, incident_id, received_at, raw_payload, source, vendor_instance_id, trigger_name, dataset, query_id
        FROM alerts
        WHERE source = $1 AND vendor_instance_id = $2`,
      [source, vendorInstanceId],
    );
    if (rows.length === 0) return null;
    return this.toAlert(rows[0]);
  }

  async attachToIncident(alertId: string, incidentId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE alerts SET incident_id = $2 WHERE id = $1`,
      [alertId, incidentId],
    );
    if (result.rowCount === 0) {
      throw new Error(
        `PgAlertRepository.attachToIncident: alert ${alertId} not found`,
      );
    }
  }

  async findFirstByIncident(incidentId: string): Promise<Alert | null> {
    const { rows } = await this.pool.query<AlertRow>(
      `SELECT id, incident_id, received_at, raw_payload, source, vendor_instance_id, trigger_name, dataset, query_id
        FROM alerts
        WHERE incident_id = $1
        ORDER BY received_at ASC, id ASC
        LIMIT 1`,
      [incidentId],
    );
    if (rows.length === 0) return null;
    return this.toAlert(rows[0]);
  }

  private toAlert(row: AlertRow): Alert {
    return {
      id: row.id,
      incidentId: row.incident_id,
      receivedAt: row.received_at,
      rawPayload: row.raw_payload,
      source: row.source,
      vendorInstanceId: row.vendor_instance_id,
      triggerName: row.trigger_name,
      dataset: row.dataset,
      queryId: row.query_id,
    };
  }
}
