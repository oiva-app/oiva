import { describe, test, expect } from "vitest";

import alertPayload from "../../../docs/three-services-timeout-alert.json";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import { alertIntake } from "./alert-intake";

test("Expect workflow to run without errors", async () => {
  const inputData = honeycombWebhookPayloadSchema.parse(alertPayload);

  const run = await alertIntake.createRun();
  const result = await run.start({ inputData });

  expect(result.status).toBe("success");
});