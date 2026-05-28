import { test, expect } from "vitest";

import alertPayload from "../../../docs/sample_alerts/lisa.json";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import { mastra } from "../index";

test("INTEGRATION: Expect workflow to run without errors", async () => {
  const inputData = honeycombWebhookPayloadSchema.parse(alertPayload);

  const workflow = mastra.getWorkflow("alertIntake");
  const run = await workflow.createRun();
  const result = await run.start({ inputData });

  expect(result.status).toBe("success");
}, 20000);
