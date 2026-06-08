/**
 * Database row types. These mirror the SQL schema column-for-column
 * with snake_case keys (Postgres convention).
 * Repository adapters translate between row types and domain types from ../ports/*.
 *
 * Keep these in sync with the migrations under db/migrations/.
 */

export interface IncidentRow {
  id: string;
  status: string;
  created_at: Date;
  status_updated_at: Date;
  resolved_at: Date | null;
  slack_thread_ts: string | null;
  slack_channel_id: string | null;
}

export interface AlertRow {
  id: string;
  incident_id: string | null;
  received_at: Date;
  raw_payload: unknown;
  source: string;
  vendor_instance_id: string | null;
  trigger_name: string | null;
  dataset: string | null;
  query_id: string | null;
}

export interface ReportRow {
  id: string;
  incident_id: string;
  generated_at: Date;
  report_json: unknown;
  feedback: string | null;
}
