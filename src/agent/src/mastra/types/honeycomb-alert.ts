import { z } from "zod";

export const RawAlertSchema = z.looseObject({
  instanceId: z.string(),
  description: z.string(),
  status: z.enum(["TRIGGERED", "OK"]),
  summary: z.string(),
  timestamp: z.string(),
  isTest: z.boolean(),
});

export const honeycombWebhookPayloadSchema = z.object({
  secret: z.string().optional(),
  name: z.string(),
  id: z.string(),
  description: z.string(),
  links: z.object({ url: z.string() }),
  environment: z.string(),
  threshold: z.object({ op: z.string(), value: z.string() }),
  datasets: z.array(z.string()),
  result: z.object({
    groupsTriggered: z.array(
      z.object({
        field: z.string().optional(),
        value: z.string().optional(),
        count: z.number().optional(),
      }),
      // z.looseObject(z.string()),
    ),
    links: z.object({ url: z.string() }),
  }),
  alert: RawAlertSchema,
});

export type RawAlert = z.infer<typeof RawAlertSchema>;
export type HoneycombWebhookPayload = z.infer<
  typeof honeycombWebhookPayloadSchema
>;

/*
//Alert test 
{
  "name": "Too many HTTP request errors",
  "id": "sbLy6gwM56r",
  "description": "This trigger notifies us if there are any 500-level HTTP status requests",
  "links": {
    "url": "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/triggers/sbLy6gwM56r?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook"
  },
  "environment": "homelab-env",
  "threshold": {
    "op": "greater than",
    "value": "0.05"
  },
  "result": {
    "groupsTriggered": [],
    "links": {
      "url": "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/8js9dkr9nf2/a/CZxFiuoAp5Z?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook"
    }
  },
  "alert": {
    "instanceId": "715de210-d961-466a-be70-89ba6a4b6fb5",
    "description": "homelab-env environment:\nCurrent value no longer greater than threshold value (0.05) for any http.route",
    "status": "OK",
    "summary": "TRIGGER TEST: Resolved: Too many HTTP request errors",
    "isTest": true
  }
}
*/
