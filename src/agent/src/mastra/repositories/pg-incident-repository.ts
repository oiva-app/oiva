/**
 * Postgres adapter for IncidentRepository.
 *
 * Row-to-domain translation lives here (snake_case → camelCase).
 */
import type { Pool } from "pg";
import { IncidentRow } from "../db/types";
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
         RETURNING id, status, created_at, resolved_at`,
      [status],
    );
    return this.toIncident(rows[0]);
  }

  async findById(id: string): Promise<Incident | null> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT id, status, created_at, resolved_at
         FROM incidents
         WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.toIncident(rows[0]);
  }

  async updateStatus(id: string, next: IncidentStatus): Promise<Incident> {
    const { rows } = await this.pool.query<IncidentRow>(
      `UPDATE incidents
         SET status = $2
         WHERE id = $1
         RETURNING id, status, created_at, resolved_at`,
      [id, next],
    );
    if (rows.length === 0) {
      throw new Error(
        `PgIncidentRepository.updateStatus: incident ${id} not found`,
      );
    }
    return this.toIncident(rows[0]);
  }

  async findActiveCandidates(opts: CorrelationLookup): Promise<Incident[]> {
    const { rows } = await this.pool.query<IncidentRow>(
      `SELECT DISTINCT i.id, i.status, i.created_at, i.resolved_at
         FROM incidents i
         INNER JOIN alerts a ON a.incident_id = i.id
         WHERE a.trigger_name = $1
           AND a.dataset = $2
           AND a.query_id = $3
           AND a.received_at > $4
           AND i.status NOT IN ('report_delivered', 'closed')
         ORDER BY i.created_at DESC`,
      [opts.triggerName, opts.dataset, opts.queryId, opts.since],
    );
    return rows.map((row) => this.toIncident(row));
  }

  private toIncident(row: IncidentRow): Incident {
    return {
      id: row.id,
      status: row.status as IncidentStatus,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    };
  }
}
