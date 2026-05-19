import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { HoneycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import {
  AlertContextSchema,
  FilteredOutcomeSchema,
} from "../types/alert-context";
import {
  TelemetryStepOutputSchema,
  TelemetryFindingsSchema,
  codebaseInvestigatorOutputSchema,
} from "../types/investigation";
import { verifyAlert, normalizeAlert } from "../adapters/honeycomb-adapter";
import { env } from "../config/env";

// step 1: verify alert
/**
 V: Outcomes (per VerifyResult in the HC adapter):
  - invalid => throw => workflow fails => HTTP boundary should return 401
  - filtered => bail({kind:"filtered", ...}) => workflow ends successfully with a FilteredOutcome as its final output
  - actionable => return inputData unchanged => passes to normalizeStep
 */
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

// Step 2 — normalize
// Only reached when verify returns actionable. Pure transform: HC payload => AlertContext.
const normalizeStep = createStep({
  id: "normalize-alert",
  description:
    "Reshapes the HC payload into a vendor-neutral AlertContext for downstream steps.",
  inputSchema: HoneycombWebhookPayloadSchema,
  outputSchema: AlertContextSchema,
  execute: async ({ inputData }) => normalizeAlert(inputData),
});

// step 4.1: telemetry agent investigation
/**
 * Invoke telemetery agent
 * Return context used to generate report
https://mastra.ai/docs/agents/structured-output  https://mastra.ai/reference/agents/generate#response-structure
   
 */
const investigateTelemetry = createStep({
  id: "telemetry-investigation",
  inputSchema: AlertContextSchema,
  outputSchema: TelemetryStepOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const telemetryAgent = mastra.getAgentById("telemetry-agent");
    const response = await telemetryAgent.generate(
      JSON.stringify(inputData, null, 2),
      {
        structuredOutput: {
          schema: TelemetryFindingsSchema,
        },
      },
    );
    const findings = response.object;
    console.log(findings);

    return {
      alert: inputData,
      telemetryFindings: findings,
    };
  },
});

// step 4.2 : code investigation
const investigateCodebase = createStep({
  id: "investigate-codebase",
  inputSchema: TelemetryStepOutputSchema,
  outputSchema: codebaseInvestigatorOutputSchema,
  execute: async ({ inputData, mastra }) => {
    // setState was removed from the destructured param
    // get something like an architecture.md file (either add to system prompt or add to inputData?)
    const codebaseInvestigator = mastra.getAgentById("codebase-investigator");
    const result = await codebaseInvestigator.generate(
      JSON.stringify(inputData, null, 2),
      {
        structuredOutput: {
          schema: codebaseInvestigatorOutputSchema,
        },
      },
    );
    // what needs to get added to the workflow state?
    // await setState({ codebaseFindings: result })
    return result.object;
  },
});
// step 5: report

// Workflow: ingestion only for now.
// outputSchema is a union of the filtered terminal and the (eventual)
// investigation result. As contextualize/investigate/report steps land,
// extend the actionable side of this union (likely with a ReportSchema).
export const oivaWorkflow = createWorkflow({
  id: "oiva-workflow",
  inputSchema: HoneycombWebhookPayloadSchema,
  outputSchema: z.union([
    FilteredOutcomeSchema,
    AlertContextSchema, // placeholder: replace with Report schema later
  ]),
})
  .then(verifyStep)
  .map(async ({ inputData }) => {
    // verifyStep.bail() short-circuits the filtered case; only the
    // actionable HoneycombWebhookPayload shape can reach this point.
    // Runtime guard is defense-in-depth: if bail's semantics ever change,
    // we fail loudly here rather than passing a wrong shape into normalize.
    if ("kind" in inputData && inputData.kind === "filtered") {
      throw new Error(
        "unreachable: filtered payload reached normalize boundary",
      );
    }
    return inputData;
  })
  .then(normalizeStep)
  .then(investigateTelemetry)
  .then(investigateCodebase)
  .commit();

//***INITIAL SPIKE WITH TEAM ***/

// step 1: verify alert
/**
  If secret is present and matches .env, alert isn't valid.

  Don't fire on test alerts that the user is still

  How to abort a workflow step?  Throw error or another method?
  TODO - Implement this step.  Just a placeholder for now.
 */
// const verifyAlert = createStep({
//   id: "verify-alert",
//   description:
//     "Verifies the incoming alert is valid: a genuine alert triggered by Honeycomnb, not a test",
//   // inputSchema: HoneycombWebhookPayloadSchema,
//   inputSchema: z.object({
//     alert: HoneycombWebhookPayloadSchema,
//   }),
//   outputSchema: HoneycombWebhookPayloadSchema,
//   execute: async ({ inputData, bail }) => {
//     // check if it's valid
//     const { alert } = inputData;

//     if (!("secret" in alert && alert.secret === env.HC_SHARED_SECRET)) {
//       console.log("Your alert is a counterfeit!");
//       return bail({ result: "Not a valid Honeycomb alert" });
//     }

//     if (alert.alert.isTest) {
//       console.log("Test alert");
//       return bail({ result: "Incoming alert is a test alert" });
//     }

//     if (alert.alert.status !== "TRIGGERED") {
//       console.log(
//         `Status not 'TRIGGERED'. Alert status is: ${alert.alert.status}`,
//       );
//       return bail({
//         result: `Status not 'TRIGGERED'. Alert status is: ${alert.alert.status}`,
//       });
//     }

//     return alert;
//   },
// });

// // step 2: normalize alert
// const normalizeAlert = createStep({
//   id: "normalize-alert",
//   description: "Normalizes the alert into a shape expected by Oiva",
//   inputSchema: z.object({}),
//   outputSchema: z.object({}),
//   // execute: ({ inputData }) => {},
// });

// // step 3: contextualize (DEFERRED)
// const contextualizeAlert = createStep({
//   id: "contextualize-alert",
//   description:
//     "Creates a textual description of the alert to help Oiva reason about the alert",
//   inputSchema: z.object({
//     alert: HoneycombWebhookPayloadSchema,
//   }),
//   outputSchema: z.object({}),
//   // execute: ({ inputData }) => {},
// });

// step 4: investigate
/**
 * Invoke agent
 * Return context used to generate report
 */
// const investigateAlert = createStep({
//   id: "investigate",
//   inputSchema: z.object({
//     foo: z.string(),
//   }),
//   outputSchema: z.object({}),
//   execute: async ({ inputData }) => {
//     const { foo } = inputData;

//     return {};
//   },
// });

// // step 5: generate report
// const generateReport = createStep({
//   id: "generate-report",
//   description: "Generates the final report",
//   inputSchema: z.object({
//     foo: z.string(),
//   }),
//   outputSchema: z.object({}),
//   execute: async ({ inputData }) => {
//     const { foo } = inputData;

//     return {};
//   },
// });

// Stitch into worflow
// export const oivaWorkflow = createWorkflow({
//   id: 'oiva-workflow',
//   inputSchema:,
//   outputSchema:,
// })
//   .then(verifyAlert)
//   .then(normalizeAlert)
//   .then(investigateAlert)
//   .then(generateReport)
//   .commit();
