import type { Context } from "hono";
import type { Mastra } from "@mastra/core/mastra";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import {
  verifyAlert,
  normalizeAlert,
  extractQueryId,
} from "../adapters/honeycomb-adapter";
import { incidentRepository, alertRepository } from "../repositories";
import { correlate } from "../domain/correlation";
import { env } from "../config/env";
import { z } from "zod";

const SOURCE = "honeycomb";
/**
 * POST /hook/honeycomb/alert
 *
 * Boundary responsibilities (Khorikov: validate + decide at the edge):
 *   1. JSON parse                         → 400 invalid-json
 *   2. Schema parse (HC wire shape)       → 400 invalid-payload
 *   3. Verify (auth + filter)             → 401 unauthorized or 202 filtered
 *   4. Normalize HC payload → AlertContext
 *   5. Wire-level dedup (alertRepo.findByVendorInstanceId)
 *      → on hit, return 202 already-accepted; no further processing
 *   6. Persist the alert (alertRepo.insert)
 *   7. Correlation (incidentRepo.findActiveCandidates + correlate())
 *      → match  : attach to existing incident, return 202 attached
 *      → new    : create incident, attach alert, dispatch workflow,
 *                 return 202 accepted with runId
 *
 * Fire-and-forget: workflow dispatch is unawaited. Investigation runs
 * in the background; the 202 response is immediate.
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
      { error: "invalid-payload", issues: z.treeifyError(parsed.error) },
      400,
    );
  }
  // 3. Verify (auth + filter)
  const providedSecret =
    c.req.header("x-honeycomb-webhook-token") ?? parsed.data.secret;
  const verdict = verifyAlert(
    parsed.data,
    providedSecret,
    env.HC_SHARED_SECRET,
  );

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

  // 4. Normalize
  const alertContext = normalizeAlert(parsed.data);
  const vendorInstanceId = parsed.data.alert.instanceId;
  const { triggerName, datasets } = alertContext;
  const dataset = datasets[0] ?? null;
  const queryId = extractQueryId(alertContext.resultUrl);

  // 5. Wire-level dedup. Returns the existing alert if this exact webhook
  // delivery was previously processed (HC at-least-once retry). Short-
  // circuits the rest of the flow — we don't re-persist or re-dispatch.
  const existing = await alertRepository.findByVendorInstanceId(
    SOURCE,
    vendorInstanceId,
  );
  if (existing) {
    return c.json(
      {
        status: "already-accepted",
        instanceId: vendorInstanceId,
        alertId: existing.id,
        incidentId: existing.incidentId,
      },
      202,
    );
  }

  // 6. Persist the alert.
  const alert = await alertRepository.insert({
    source: SOURCE,
    vendorInstanceId,
    rawPayload: parsed.data,
    triggerName,
    dataset: dataset ?? undefined,
    queryId: queryId ?? undefined,
  });

  // 7. Correlation. Skip if we couldn't extract a queryId correlation
  // needs all three keys, so a missing queryId falls through to "new
  // incident" rather than risking a wrong match.
  const candidates =
    dataset && queryId
      ? await incidentRepository.findActiveCandidates({
          triggerName,
          dataset,
          queryId,
          since: new Date(Date.now() - env.CORRELATION_WINDOW_MINUTES * 60_000),
        })
      : [];

  const result = correlate(candidates);
  if (result.kind === "match") {
    await alertRepository.attachToIncident(alert.id, result.incidentId);
    return c.json(
      {
        status: "attached",
        instanceId: vendorInstanceId,
        alertId: alert.id,
        incidentId: result.incidentId,
        correlation: "matched",
      },
      202,
    );
  }

  // result.kind === "new" — create incident, attach alert, dispatch.
  const incident = await incidentRepository.create();
  await alertRepository.attachToIncident(alert.id, incident.id);

  const mastra = c.get("mastra") as Mastra;
  const workflow = mastra.getWorkflow("oivaWorkflow");
  const run = await workflow.createRun();

  void run
    .start({
      inputData: { incidentId: incident.id, alertContext },
    })
    .catch((err: unknown) => {
      mastra.getLogger().error("workflow run failed", {
        runId: run.runId,
        err,
      });
    });

  return c.json(
    {
      runId: run.runId,
      status: "accepted",
      instanceId: vendorInstanceId,
      alertId: alert.id,
      incidentId: incident.id,
      correlation: "new",
    },
    202,
  );
}
