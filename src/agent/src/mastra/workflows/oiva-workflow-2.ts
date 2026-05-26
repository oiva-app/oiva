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
import { mvpMcpClient, honeycomb_get_query_results } from "../mcp/mcpClients";
import { graphAgent } from "../agents/graph-agent";
import {
  mcpToolResultSchema,
  type McpResourceLink,
} from "../types/mcp";

const workflowStateSchema = z.object({
  alertContext: alertContextSchema.optional(),
  queryResult: z.any().default(null),
  queryDetails: z.any().default(null),
});

// This is a partial model of
// src/agent/docs/planning/alert_contextualization/query_details.json
const HCQueryDetailsSchema = z.object({
  results: z.array(
    z.object({
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  template: z.object({
    breakdowns: z.array(z.string()).describe("GROUP: How are spans grouped?"),
    calculations: z
      .array(
        z.object({
          op: z.string(),
        }),
      )
      .describe("SELECT: how are spans selected?"),
    filters: z.array(
      z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
    ).describe("FILTER: how are spans filtered?"),
    start_time: z.int(),
    end_time: z.int(),
  }),
  info: z.object({
    granularity_seconds: z.number()
  })
});




/*
SOME OF THESE STEPS WOULD BE BETTER USING THE HONEYCOMB API
INSTEAD OF THE HONEYCOMB MCP

However, the API requires an Enterprise license
 */



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
  description:
    "Remove context to keep info from Agent, with goal of improving investigation",
  inputSchema: alertContextSchema,
  stateSchema: workflowStateSchema,
  outputSchema: alertContextSchema,
  execute: async ({ inputData, state, setState }) => {
    const redacted = { ...inputData, triggerUrl: "" };
    await setState({ ...state, alertContext: redacted });
    return redacted;
  },
});

const getQueryResultsStep = createStep({
  id: "get-query-results",
  description: "Get query results via API",
  inputSchema: alertContextSchema,
  stateSchema: workflowStateSchema,
  outputSchema: mcpToolResultSchema,
  execute: async ({ inputData, state, setState }) => {
    const tool = honeycomb_get_query_results;
    if (!tool.execute) throw new Error("get_query_results has no execute()");
    const queryResult = await tool.execute({ url: inputData.resultUrl }, {});
    await setState({ ...state, queryResult });
    return queryResult;
  },
});

const getQueryDetailsStep = createStep({
  id: "get-query-details",
  description: "Get more details about the query",
  inputSchema: mcpToolResultSchema,
  stateSchema: workflowStateSchema,
  outputSchema: HCQueryDetailsSchema,
  execute: async ({ inputData, state, setState }) => {
    // The previous step returns the tool's { content: [...] } envelope, which
    // includes a resource_link to the raw query results as JSON.
    const link = inputData.content.find(
      (c): c is McpResourceLink =>
        c.type === "resource_link" && c.mimeType === "application/json",
    );
    if (!link?.uri) throw new Error("no JSON resource_link in query results");

    const res = await mvpMcpClient.resources.read("honeycomb", link.uri);
    const content = res.contents[0];
    if (!("text" in content)) {
      throw new Error("query results resource returned non-text content");
    }
    const t = JSON.parse(content.text);
    const queryDetails = HCQueryDetailsSchema.parse(t)

    await setState({ ...state, queryDetails });
    return queryDetails;
  },
});

const returnStateStep = createStep({
  id: "return-state",
  description: "Return the workflow state.  Discard input",
  inputSchema: z.any(),
  outputSchema: workflowStateSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ state }) => {
    return state;
  },
});

export const oivaWorkflow2 = createWorkflow({
  id: "oiva-workflow-2",
  stateSchema: workflowStateSchema,
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
  .then(getQueryDetailsStep)
  .then(returnStateStep)
  .commit();
