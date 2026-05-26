import { z } from "zod";

export const AlertContextSchema = z.object({
  status: z.enum(["TRIGGERED", "OK"]),
  isTest: z.boolean(),
  triggerName: z.string(),
  description: z.string(),
  environment: z.string(),
  datasets: z.array(z.string()),
  groupsTriggered: z.array(
    z.object({
      field: z.string().optional(),
      value: z.string().optional(),
      count: z.number().optional(),
    }),
  ),
  alert: z.object({
    timestamp: z.string(),
  }),
  resultUrl: z.string(),
  triggerUrl: z.string(),
  instanceId: z.string(),
});

export type AlertContext = z.infer<typeof AlertContextSchema>;

// The "Scrubbed" version is for when you want to omit certain properties
// from the agent context
export const ScrubbedAlertContextSchema = AlertContextSchema.omit({
  triggerUrl: true,
});
export type ScrubbedAlert = z.infer<typeof ScrubbedAlertContextSchema>;

//The outcome type when the workflow terminates early because the alert wasn't worth an investigation
export const FilteredOutcomeSchema = z.object({
  kind: z.literal("filtered"),
  reason: z.string(), // keep open — each vendor has its own filter reasons
  instanceId: z.string(),
});
export type FilteredOutcome = z.infer<typeof FilteredOutcomeSchema>;
