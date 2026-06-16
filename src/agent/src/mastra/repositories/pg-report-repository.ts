import type { Pool } from "pg";
import type { ReportRow } from "../db/types";
import type { Feedback, Report } from "@/domain/report";
import type {
  InsertReportInput,
  ReportRepository,
} from "../ports/report-repository";

export class PgReportRepository implements ReportRepository {
  constructor(private readonly pool: Pool) {}

  async insert(input: InsertReportInput): Promise<Report> {
    const { rows } = await this.pool.query<ReportRow>(
      `INSERT INTO reports (incident_id, report_json)
          VALUES ($1, $2::jsonb)
          RETURNING id, incident_id, generated_at, report_json, feedback`,
      [input.incidentId, JSON.stringify(input.reportJson)],
    );
    return this.toReport(rows[0]);
  }

  async findById(id: string): Promise<Report | null> {
    const { rows } = await this.pool.query<ReportRow>(
      `SELECT id, incident_id, generated_at, report_json, feedback
          FROM reports
          WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.toReport(rows[0]);
  }

  async findByIncidentId(incidentId: string): Promise<Report[]> {
    const { rows } = await this.pool.query<ReportRow>(
      `SELECT id, incident_id, generated_at, report_json, feedback
          FROM reports
          WHERE incident_id = $1
          ORDER BY generated_at DESC`,
      [incidentId],
    );
    return rows.map((row) => this.toReport(row));
  }

  async recordFeedback(id: string, feedback: Feedback): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE reports SET feedback = $2 WHERE id = $1`,
      [id, feedback],
    );
    if (rowCount === 0) {
      throw new Error(
        `PgReportRepository.recordFeedback: report ${id} not found`,
      );
    }
  }

  private toReport(row: ReportRow): Report {
    return {
      id: row.id,
      incidentId: row.incident_id,
      generatedAt: row.generated_at,
      reportJson: row.report_json,
      feedback: row.feedback as Feedback | null,
    };
  }
}
