import { z } from "zod";

export const reportAgentOutputSchema = z.object({
  title: z.string().max(60).describe("Plain text incident title. No markdown."),
  summary: z.string().describe("Markdown string. No section heading."),
  alertOverview: z.string().describe("Markdown string. No section heading."),
  hypothesis: z.string().describe("Markdown string. No section heading."),
  findings: z.string().describe("Markdown string. No section heading."),
  nextSteps: z.string().describe("Markdown string. No section heading."),
  investigationSteps: z
    .string()
    .describe("Markdown string. No section heading."),
});

export type ReportAgentOutput = z.infer<typeof reportAgentOutputSchema>;
