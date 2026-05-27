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
import { mcpToolResultSchema, type McpResourceLink } from "../types/mcp";

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
    filters: z
      .array(
        z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])),
      )
      .describe("FILTER: how are spans filtered?"),
    start_time: z.int(),
    end_time: z.int(),
  }),
  info: z.object({
    granularity_seconds: z.number(),
  }),
});

/**
 * TODO: CENTRALIZE THIS TIMEZONE CONFIG (currently hardcoded)
 * Convert all timestamps to GMT to keep things simple? Or maybe this would just complicate things?
 * What timezone does Honeycomb MCP expect??
 */
function formatTimestamp(ms: number, timeZone = "America/New_York"): string {
  if (!Number.isFinite(ms))
    throw new Error(`formatTimestamp: invalid ms ${ms}`);
  const date = new Date(ms);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset", // -> "GMT-04:00"
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const offset = get("timeZoneName").replace("GMT", "UTC"); // "UTC-04:00"

  return `${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${offset}`;
}

const TIME_PLACEHOLDER = "unknown";

const workflowStateSchema = z.object({
  alertContext: alertContextSchema.optional(),
  queryResult: z.any().default(null),
  queryDetails: z.any().default(null),
  t1: z
    .string()
    .default(TIME_PLACEHOLDER)
    .describe("Beginning of investigation window"),
  t2: z
    .string()
    .default(TIME_PLACEHOLDER)
    .describe("Approximate time of problem onset"),
  t3: z
    .string()
    .default(TIME_PLACEHOLDER)
    .describe("Time that alert was fired"),
  t4: z
    .string()
    .default(TIME_PLACEHOLDER)
    .describe("End of investigation window"),
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
  outputSchema: alertContextSchema,
  stateSchema: workflowStateSchema,
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
  outputSchema: mcpToolResultSchema,
  stateSchema: workflowStateSchema,
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
  outputSchema: HCQueryDetailsSchema,
  stateSchema: workflowStateSchema,
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
    const queryDetails = HCQueryDetailsSchema.parse(t);

    await setState({ ...state, queryDetails });
    return queryDetails;
  },
});

/**
 * TODO: METHOD FOR CALCULATING T1 AND T4 IS VERY ROUGH AND SHOULD BE IMPROVED
 * PROBABLY WARRANTS A SUBAGENT CALL?
 */
const extractTimestamps = createStep({
  id: "extract-timestamps",
  description: "Extract timestamps from the gathered context",
  inputSchema: HCQueryDetailsSchema,
  outputSchema: workflowStateSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ state, setState }) => {
    const queryStart = state.queryDetails.template.start_time;
    const queryEnd = state.queryDetails.template.end_time;
    const queryDuration = queryEnd - queryStart;
    const t3 = formatTimestamp(state.queryDetails.template.end_time * 1000);
    
    // TODO - T1 AND T4 NEED IMPROVEMENT
    const t1 = formatTimestamp((queryStart - queryDuration * 3) * 1000);
    const t4 = formatTimestamp((queryEnd + queryDuration * 2) * 1000);

    const newState = {
      ...state,
      t1,
      t3,
      t4,
    };
    await setState(newState);
    return newState;
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
  .then(extractTimestamps)
  .then(returnStateStep)
  .commit();
