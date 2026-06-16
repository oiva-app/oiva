import { z } from "zod";
import { nextStepSchema, investigationStepSchema } from "./investigation";

export const hypothesisSchema = z.object({
  paragraph: z
    .string()
    .describe(
      "Markdown prose: leading theory, category, natural-language confidence.",
    ),
  evidenceFor: z
    .array(z.string())
    .describe("Supporting findings. Plain text; code identifiers in backticks."),
  evidenceAgainst: z
    .array(z.string())
    .describe("Counter-evidence / ruled-out items. Plain text; [] if none."),
});
export type Hypothesis = z.infer<typeof hypothesisSchema>;

export const reportAgentOutputSchema = z.object({
  title: z.string().max(60).describe("Plain text incident title. No markdown."),
  summary: z.string().describe("Markdown string. No section heading."),
  alertOverview: z.string().describe("Markdown string. No section heading."),
  hypothesis: hypothesisSchema,
  nextSteps: z
    .array(nextStepSchema)
    .describe("Priority-grouped next-step items. Not markdown."),
});

export type ReportAgentOutput = z.infer<typeof reportAgentOutputSchema>;

export const incidentReportSchema = reportAgentOutputSchema.extend({
  id: z.string(),
  durationMs: z.number().nullable(),
  investigationSteps: z.array(investigationStepSchema),
});

export type IncidentReport = z.infer<typeof incidentReportSchema>;
