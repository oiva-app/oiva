import type { Context } from "hono";
import type { Mastra } from "@mastra/core/mastra";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import { verifyAlert } from "../adapters/honeycomb-adapter";
import { env } from "../config/env";
import { z } from "zod";
/**
 * POST /hook/alert
 *
 * Boundary responsibilities (Khoriko rule: validate at the edge):
 *   1. JSON parse                         -> 400 if the body isn't JSON
 *   2. Schema parse (HC wire shape)       -> 400 if it isn't a Honeycomb webhook
 *   3. Auth (shared-secret field check)   -> 401 if missing/wrong
 *   4. Hand off to oivaWorkflow           -> 202 with runId
 *
 * Filter decisions (isTest, status != TRIGGERED) deliberately stay inside
 * the workflow's verifyStep so they appear in Mastra Studio with their reason,
 * and a "we filtered N test alerts this week, by environment" query stays
 * one Honeycomb question (Majors).
 *
 * Fire-and-forget: investigation can run for minutes. Holding the HTTP
 * connection open would invite Honeycomb's webhook retry timer. We start the
 * run, capture its id, and respond 202 immediately. Run progress is
 * observable in Studio and via OTel spans.
 */
export async function alertHookHandler(c: Context) {
  // 1. JSON parse
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "invalid-json" }, 400);
  }

  // 2. Schema parse — is this even shaped like a Honeycomb webhook?
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

  // 3. Auth at the boundary. verifyAlert returns three kinds; we only act on
  //    "invalid" here. "filtered" and "actionable" both flow into the workflow,
  //    where the filter reason is recorded as a bail outcome.
  const verdict = verifyAlert(parsed.data, env.HC_SHARED_SECRET);
  if (verdict.kind === "invalid") {
    return c.json({ error: "unauthorized", reason: verdict.reason }, 401);
  }

  // 4. Start the workflow run. Do not await completion.
  const mastra = c.get("mastra") as Mastra;
  const workflow = mastra.getWorkflow("oivaWorkflow");
  const run = await workflow.createRun();

  void run.start({ inputData: parsed.data }).catch((err: unknown) => {
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
