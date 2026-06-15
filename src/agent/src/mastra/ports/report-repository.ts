import type { Feedback, Report } from "@/domain/report";

export interface InsertReportInput {
  incidentId: string;
  reportJson: unknown;
}

export interface ReportRepository {
  insert(input: InsertReportInput): Promise<Report>;
  findById(id: string): Promise<Report | null>;
  findByIncidentId(incidentId: string): Promise<Report[]>;
  recordFeedback(id: string, feedback: Feedback): Promise<void>;
}
