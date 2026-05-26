import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import {
  alertContextSchema,
  filteredOutcomeSchema,
  scrubbedAlertContextSchema,
} from "../types/alert-context";
import { verifyAlert, normalizeAlert } from "../adapters/honeycomb-adapter";
import { env } from "../config/env";
import { honeycomb_get_query_results } from "../mcp/mcpClients";
import { graphAgent } from "../agents/graph-agent";

const OivaWorkflowStateSchema = z.object({
  alertContext: alertContextSchema.optional(),
  queryResult: z.any().default(null)
});

const verifyStep = createStep({
  id: "verify-alert",
  description:
    "Verifies the webhook payload: shared-secret integrity (if configured) and actionability (test/status filters).",
  inputSchema: honeycombWebhookPayloadSchema,
  // Step output must satisfy bail (filtered) and pass-through (actionable).
  outputSchema: z.union([honeycombWebhookPayloadSchema, filteredOutcomeSchema]),
  execute: async ({ inputData, bail }) => {
    const result = verifyAlert(inputData, env.HC_SHARED_SECRET);

    switch (result.kind) {
      case "invalid":
        throw new Error(`Honeycomb webhook rejected: ${result.reason}`);

      case "filtered":
        return bail({
          kind: "filtered" as const,
          reason: result.reason,
          instanceId: inputData.alert.instanceId,
        });

      case "actionable":
        return inputData;
    }
  },
});



const normalizeStep = createStep({
  id: "normalize-alert",
  description:
    "Normalize the HC payload into a vendor-neutral AlertContext for downstream steps.",
  inputSchema: honeycombWebhookPayloadSchema,
  outputSchema: alertContextSchema,
  execute: async ({ inputData }) => normalizeAlert(inputData),
});

/**
 * It's possible / likely that this step should be omitted from production runs
 * It is helpful for testing with stale alerts and missing triggers.
 */
const redactStep = createStep({
  id: "scrub-alert",
  description: "Remove context to keep info from Agent, with goal of improving investigation",
  inputSchema: alertContextSchema,
  outputSchema: alertContextSchema,
  execute: async ({ inputData, setState }) => {
    const redacted = { ...inputData }
    redacted.triggerUrl = ""
    setState(() => {alertContext: redacted})
    return redacted
  }
})

const getQueryResultsStep = createStep({
  id: "get-query-results",
  description: "Get query results via API",
  inputSchema: alertContextSchema,
  outputSchema: z.object({
    content: z.any(),
  }),
  execute: async ({ inputData, state, setState }) => {
    const tool = honeycomb_get_query_results
    if (!tool.execute) throw new Error("get_query_results has no execute()")
    const result = await tool.execute({url: inputData.resultUrl}, {})
    setState( (s) => ({...s, queryResult: result}))
    return result
  }
})



export const oivaWorkflow2 = createWorkflow({
  id: "oiva-workflow-2",
  stateSchema: OivaWorkflowStateSchema,
  inputSchema: honeycombWebhookPayloadSchema,
  outputSchema: z.union([
    filteredOutcomeSchema,
    alertContextSchema, // placeholder: replace with Report schema later
  ]),
})
  .then(verifyStep)
  .map(async ({ inputData }) => {
    if ("kind" in inputData && inputData.kind === "filtered") {
      throw new Error(
        "This error should never throw.  Looks like bail() didn't work?",
      );
    }
    return inputData;
  })
  .then(normalizeStep)
  .then(redactStep)
  .then(getQueryResultsStep)
  .commit();
