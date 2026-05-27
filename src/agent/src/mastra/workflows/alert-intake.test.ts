import { test, expect } from "vitest";

import alertPayload from "../../../docs/sample_alerts/lisa.json";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import { alertIntake } from "./alert-intake";

test("INTEGRATION: Expect workflow to run without errors", async () => {
  const inputData = honeycombWebhookPayloadSchema.parse(alertPayload);

  const run = await alertIntake.createRun();
  const result = await run.start({ inputData });

  expect(result.status).toBe("success");
});