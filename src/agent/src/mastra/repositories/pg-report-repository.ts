import type { Pool } from "pg";
import type {
  Feedback,
  InsertReportInput,
  Report,
  ReportRepository,
} from "../ports/report-repository";

export class PgReportRepository implements ReportRepository {
  constructor(private readonly pool: Pool) {}

  insert(_input: InsertReportInput): Promise<Report> {
    throw new Error("PgReportRepository.insert not implemented");
  }

  findById(_id: string): Promise<Report | null> {
    throw new Error("PgReportRepository.findById not implemented");
  }

  findByIncidentId(_incidentId: string): Promise<Report[]> {
    throw new Error("PgReportRepository.findByIncidentId not implemented");
  }

  recordFeedback(_id: string, _feedback: Feedback): Promise<void> {
    throw new Error("PgReportRepository.recordFeedback not implemented");
  }
}
