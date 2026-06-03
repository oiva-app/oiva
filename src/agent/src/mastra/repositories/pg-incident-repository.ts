/**
 * Postgres adapter for IncidentRepository.
 *
 * Row-to-domain translation lives here (snake_case → camelCase).
 */
import type { Pool } from "pg";
import type { IncidentRow } from "../db/types";
import type {
  CorrelationLookup,
  Incident,
  IncidentRepository,
  IncidentStatus,
} from "../ports/incident-repository";

export class PgIncidentRepository implements IncidentRepository {
  constructor(private readonly pool: Pool) {}

  async create(input?: { status?: IncidentStatus }): Promise<Incident> {
    const status = input?.status ?? "triggered";
    const { rows } = await this.pool.query<IncidentRow>(
      `INSERT INTO incidents (status)
         VALUES ($1)
         RETURNING id, status, created_at, status_updated_at, resolved_at, slack_thread_ts, slack_channel_id`,
      [status],
    );
    return this.toIncident(rows[0]);
  }

  async findById(id: string): Promise<Incident | null> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT id, status, created_at, status_updated_at, resolved_at, slack_thread_ts, slack_channel_id
         FROM incidents
         WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.toIncident(rows[0]);
  }

  /**
   * Updates the incident's status. Sets `resolved_at = NOW()` when the
   * status transitions to a terminal state (`report_delivered` or `closed`)
   * AND `resolved_at` is currently NULL — so the first arrival at terminal
   * is recorded, and any pre-existing value is preserved.
   *
   * State-machine validity (`canTransition`) is enforced by the caller
   * via `assertTransition` in domain/incident-state.ts, not here. This
   * method trusts its input and just performs the write.
   */
  async updateStatus(id: string, next: IncidentStatus): Promise<Incident> {
    const { rows } = await this.pool.query<IncidentRow>(
      `UPDATE incidents
         SET status = $2,
             status_updated_at = NOW(),
             resolved_at = CASE
               WHEN $2 IN ('report_delivered', 'closed') AND resolved_at IS NULL
                 THEN NOW()
               ELSE resolved_at
             END
         WHERE id = $1
         RETURNING id, status, created_at, status_updated_at, resolved_at, slack_thread_ts, slack_channel_id`,
      [id, next],
    );
    if (rows.length === 0) {
      throw new Error(
        `PgIncidentRepository.updateStatus: incident ${id} not found`,
      );
    }
    return this.toIncident(rows[0]);
  }

  /**
   * Returns incidents whose alerts match the correlation tuple
   * (triggerName, dataset, queryId) AND whose status is active
   * (NOT in 'report_delivered', 'closed', or 'failed'). The alert time window
   * is enforced via the `since` cutoff against alerts.received_at.
   */
  async findActiveCandidates(opts: CorrelationLookup): Promise<Incident[]> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT DISTINCT i.id, i.status, i.created_at, i.status_updated_at, i.resolved_at, i.slack_thread_ts, i.slack_channel_id
         FROM incidents i
         INNER JOIN alerts a ON a.incident_id = i.id
         WHERE a.trigger_name = $1
           AND a.dataset = $2
           AND a.query_id = $3
           AND a.received_at > $4
           AND i.status NOT IN ('report_delivered', 'closed', 'failed')
         ORDER BY i.created_at DESC`,
      [opts.triggerName, opts.dataset, opts.queryId, opts.since],
    );
    return rows.map((row) => this.toIncident(row));
  }

  async attachSlackThread(
    id: string,
    slack: { slackMessageId: string; slackChannelId: string },
  ): Promise<void> {
    const { rows } = await this.pool.query(
      `UPDATE incidents
         SET slack_thread_ts = $2,
             slack_channel_id = $3
         WHERE id = $1
         RETURNING id`,
      [id, slack.slackMessageId, slack.slackChannelId],
    );
    if (rows.length === 0) {
      throw new Error(
        `PgIncidentRepository.attachSlackThread: incident ${id} not found`,
      );
    }
  }

  /**
   * Returns incidents in any of `statuses` whose `status_updated_at` is older
   * than `updatedBefore`. Drives the cleanup reaper's sweeps (parked delivered
   * or failed incidents, and non-terminal incidents stuck past a deadline).
   */
  async findStaleIncidents(opts: {
    statuses: IncidentStatus[];
    updatedBefore: Date;
  }): Promise<Incident[]> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT id, status, created_at, status_updated_at, resolved_at, slack_thread_ts, slack_channel_id
         FROM incidents
         WHERE status = ANY($1)
           AND status_updated_at < $2
         ORDER BY status_updated_at ASC`,
      [opts.statuses, opts.updatedBefore],
    );
    return rows.map((row) => this.toIncident(row));
  }

  private toIncident(row: IncidentRow): Incident {
    return {
      id: row.id,
      status: row.status as IncidentStatus,
      createdAt: row.created_at,
      statusUpdated: row.status_updated_at,
      resolvedAt: row.resolved_at,
      slackThreadTs: row.slack_thread_ts,
      slackChannelId: row.slack_channel_id,
    };
  }
}
