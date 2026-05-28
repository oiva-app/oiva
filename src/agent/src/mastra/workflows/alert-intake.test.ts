import { test, expect, afterAll } from "vitest";
import { trace, SpanStatusCode } from "@opentelemetry/api";

import alertPayloadLisa from "../../../docs/sample_alerts/lisa.json";
import alertPayloadWiggum from "../../../docs/sample_alerts/wiggum.json";
import { HoneycombWebhookPayload, honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import { mastra } from "../index";

const tracer = trace.getTracer("alert-intake-test");

async function workflowTest(payload: HoneycombWebhookPayload) {
  const inputData = honeycombWebhookPayloadSchema.parse(payload);

  await tracer.startActiveSpan("alert-intake.integration-test", async (span) => {
    try {
      span.setAttribute(
        "test.alert.triggerName",
        inputData.alert?.description ?? "",
      );
      const workflow = mastra.getWorkflow("alertIntake");
      const run = await workflow.createRun();
      span.setAttribute("workflow.runId", run.runId);

      const result = await run.start({ inputData });

      span.setAttribute("workflow.status", result.status);
      expect(result.status).toBe("success");
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      if (err instanceof Error) {
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        });
        throw err;
      } else {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: String(err),
        });
      }
    } finally {
      span.end();
    }
  });
}

test("INTEGRATION: Expect workflow to run without errors", async () => {
  workflowTest(alertPayloadLisa)
}, 20000);

test("INTEGRATION: Expect workflow to run without errors", async () => {
  workflowTest(alertPayloadWiggum)
}, 20000);

// Flush spans before the process exits — the batch span processor buffers
// exports and vitest will exit before its timer fires.
afterAll(async () => {
  const provider = trace.getTracerProvider() as unknown as {
    forceFlush?: () => Promise<void>;
    shutdown?: () => Promise<void>;
  };
  await provider.forceFlush?.();
  await provider.shutdown?.();
});
