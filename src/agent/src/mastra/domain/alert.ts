import * as z from "zod";

export const AlertSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid().nullable(),
  receivedAt: z.date(),
  rawPayload: z.unknown(),
  source: z.string(),
  vendorInstanceId: z.string().nullable(),
  triggerName: z.string().nullable(),
  dataset: z.string().nullable(),
  queryId: z.string().nullable(),
});
export type Alert = z.infer<typeof AlertSchema>;
