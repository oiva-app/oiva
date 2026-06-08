import * as z from "zod";

export const FeedbackSchema = z.enum(["positive", "negative"]);
export type Feedback = z.infer<typeof FeedbackSchema>;

export const ReportSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid(),
  generatedAt: z.date(),
  reportJson: z.unknown(),
  feedback: FeedbackSchema.nullable(),
});
export type Report = z.infer<typeof ReportSchema>;

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
