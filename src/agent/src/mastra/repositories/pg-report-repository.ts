import type { Pool } from "pg";
import type { ReportRow } from "../db/types";
import type {
  Feedback,
  InsertReportInput,
  Report,
  ReportRepository,
} from "../ports/report-repository";

export class PgReportRepository implements ReportRepository {
  constructor(private readonly pool: Pool) {}

  async insert(input: InsertReportInput): Promise<Report> {
    const { rows } = await this.pool.query<ReportRow>(
      `INSERT INTO reports
          (incident_id, report_json, slack_message_id, slack_channel_id)
          VALUES ($1, $2::jsonb, $3, $4)
          RETURNING id, incident_id, generated_at, report_json, slack_message_id, slack_channel_id, feedback`,
      [
        input.incidentId,
        JSON.stringify(input.reportJson),
        input.slackMessageId ?? null,
        input.slackChannelId ?? null,
      ],
    );
    return this.toReport(rows[0]);
  }

  async findById(id: string): Promise<Report | null> {
    const { rows } = await this.pool.query<ReportRow>(
      `SELECT id, incident_id, generated_at, report_json, slack_message_id, slack_channel_id, feedback
          FROM reports
          WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return this.toReport(rows[0]);
  }

  async findByIncidentId(incidentId: string): Promise<Report[]> {
    const { rows } = await this.pool.query<ReportRow>(
      `SELECT id, incident_id, generated_at, report_json, slack_message_id, slack_channel_id, feedback
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

  async attachSlackMessage(
    id: string,
    slack: { slackMessageId: string; slackChannelId: string },
  ): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE reports
          SET slack_message_id = $2,
              slack_channel_id = $3
          WHERE id = $1`,
      [id, slack.slackMessageId, slack.slackChannelId],
    );
    if (rowCount === 0) {
      throw new Error(
        `PgReportRepository.attachSlackMessage: report ${id} not found`,
      );
    }
  }

  private toReport(row: ReportRow): Report {
    return {
      id: row.id,
      incidentId: row.incident_id,
      generatedAt: row.generated_at,
      reportJson: row.report_json,
      slackMessageId: row.slack_message_id,
      slackChannelId: row.slack_channel_id,
      feedback: row.feedback as Feedback | null,
    };
  }
}
