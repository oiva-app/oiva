import * as z from "zod";

export const IncidentStatusSchema = z.enum([
  "triggered",
  "investigating",
  "report_in_process",
  "report_generated",
  "report_delivered",
  "failed",
  "closed",
]);

export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const IncidentSchema = z.object({
  id: z.string().uuid(),
  status: IncidentStatusSchema,
  createdAt: z.date(),
  statusUpdated: z.date(),
  resolvedAt: z.date().nullable(),
  slackThreadTs: z.string().nullable(),
  slackChannelId: z.string().nullable(),
});
export type Incident = z.infer<typeof IncidentSchema>;
