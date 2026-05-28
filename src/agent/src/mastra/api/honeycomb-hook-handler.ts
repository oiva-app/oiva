import type { Context } from "hono";
import type { Mastra } from "@mastra/core/mastra";
import { trace } from "@opentelemetry/api";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import { verifyAlert, normalizeAlert } from "../adapters/honeycomb-adapter";
import { env } from "../config/env";
import { z } from "zod";
/**
 * POST /hook/alert
 *
 * Boundary responsibilities (Khorikov rule: validate at the edge):
 *   1. JSON parse                         -> 400 if the body isn't JSON
 *   2. Schema parse (HC wire shape)       -> 400 if it isn't a Honeycomb webhook
 *   3. Auth (shared-secret field check)   -> 401 if missing/wrong
 *   4. Filter (test alerts, non-TRIGGERED) -> 202 with {status: "filtered", ...}
 *   5. Normalize HC payload -> AlertContext
 *   6. Hand off to oivaWorkflow            -> 202 with runId
 *
 * Fire-and-forget:  We start the run, capture its id, and respond 202 immediately.
 * Run progress is observable in Studio and via OTel spans.
 */
export async function alertHookHandler(c: Context) {
  // 1. JSON parse
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "invalid-json" }, 400);
  }

  // 2. Schema parse
  const parsed = honeycombWebhookPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid-payload",
        issues: z.treeifyError(parsed.error),
      },
      400,
    );
  }

  const span = trace.getActiveSpan();
  span?.setAttribute("alert.instance_id", parsed.data.alert.instanceId);
  span?.setAttribute("alert.trigger_name", parsed.data.name);
  span?.setAttribute("alert.environment", parsed.data.environment);
  span?.setAttribute("alert.is_test", parsed.data.alert.isTest);
  span?.setAttribute("alert.status", parsed.data.alert.status);

  // 3 + 4. Verify
  const verdict = verifyAlert(parsed.data, env.HC_SHARED_SECRET);
  span?.setAttribute("alert.verdict_kind", verdict.kind);
  if ("reason" in verdict) {
    span?.setAttribute("alert.verdict_reason", verdict.reason);
  }

  if (verdict.kind === "invalid") {
    return c.json({ error: "unauthorized", reason: verdict.reason }, 401);
  }

  if (verdict.kind === "filtered") {
    return c.json(
      {
        status: "filtered",
        reason: verdict.reason,
        instanceId: parsed.data.alert.instanceId,
      },
      202,
    );
  }
  // verdict.kind === "actionable" — only path that continues.

  // 5. Normalize
  const alertContext = normalizeAlert(parsed.data);

  // 6. Start the workflow run. Do not await completion.
  const mastra = c.get("mastra") as Mastra;
  const workflow = mastra.getWorkflow("oivaWorkflow");
  const run = await workflow.createRun();

  void run.start({ inputData: alertContext }).catch((err: unknown) => {
    mastra.getLogger().error("workflow run failed", {
      runId: run.runId,
      err,
    });
  });

  return c.json(
    {
      runId: run.runId,
      instanceId: parsed.data.alert.instanceId,
      status: "accepted",
    },
    202,
  );
}
