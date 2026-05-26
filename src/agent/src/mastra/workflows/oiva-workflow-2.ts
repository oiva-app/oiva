import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { HoneycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import {
  AlertContextSchema,
  FilteredOutcomeSchema,
  ScrubbedAlertContextSchema,
} from "../types/alert-context";
import {
  TelemetryStepOutputSchema,
  TelemetryFindingsSchema,
  codebaseInvestigatorOutputSchema,
  SupervisorAgentOutputSchema,
} from "../types/investigation";
import { verifyAlert, normalizeAlert } from "../adapters/honeycomb-adapter";
import { env } from "../config/env";

const OivaWorkflowStateSchema = z.object({
  alertContext: AlertContextSchema.optional(),
});

const verifyStep = createStep({
  id: "verify-alert",
  description:
    "Verifies the webhook payload: shared-secret integrity (if configured) and actionability (test/status filters).",
  inputSchema: HoneycombWebhookPayloadSchema,
  // Step output must satisfy bail (filtered) and pass-through (actionable).
  outputSchema: z.union([HoneycombWebhookPayloadSchema, FilteredOutcomeSchema]),
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
  inputSchema: HoneycombWebhookPayloadSchema,
  outputSchema: AlertContextSchema,
  execute: async ({ inputData }) => normalizeAlert(inputData),
});

/**
 * It's possible / likely that this step should be omitted from production runs
 * It is helpful for testing with stale alerts and missing triggers.
 */
const scrubStep = createStep({
  id: "scrub-alert",
  description: "Remove context to keep info from Agent, with goal of improving investigation",
  inputSchema: AlertContextSchema,
  outputSchema: ScrubbedAlertContextSchema,
  execute: async ({ inputData }) => {
    const { triggerUrl, ...scrubbed } = inputData
    return scrubbed
  }
})

const getQueryResultsStep = createStep({
  id: "get-query-results",
  description: "Get query results via API",
  inputSchema: z.union([AlertContextSchema, ScrubbedAlertContextSchema]),
  outputSchema: z.string(),
  execute: async ({ inputData }) => {
    return "beep boop"
  }
})

export const oivaWorkflow2 = createWorkflow({
  id: "oiva-workflow-2",
  stateSchema: OivaWorkflowStateSchema,
  inputSchema: HoneycombWebhookPayloadSchema,
  outputSchema: z.union([
    FilteredOutcomeSchema,
    AlertContextSchema, // placeholder: replace with Report schema later
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
  .then(scrubStep)
  .then(getQueryResultsStep)
  .commit();
