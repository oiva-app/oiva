/*
TODO: 
  - Replace z.any() schemas with real schemas
*/

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
import { ResourceLinkSchema, type McpResourceLink } from "../types/mcp";
import { stat } from "node:fs";
import {
  telemetryFindingsSchema,
  telemetryStepOutputSchema,
} from "../types/investigation";

// Shape returned by the Honeycomb MCP `get_query_results` tool's JSON
// resource_link. This is query *results*, not the query definition — there is
// no `template` here. Time window must be derived from `series[].time`.
const HCQueryResultsSchema = z.object({
  header: z.array(
    z
      .object({
        alias: z.string(),
        key_name: z.string(),
        type: z.string(),
      })
      .loose(),
  ),
  info: z
    .object({
      granularity_seconds: z.number(),
    })
    .loose(),
  results: z.array(
    z.object({
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  series: z
    .array(
      z.object({
        data: z.record(z.string(), z.unknown()),
        time: z.string().describe("ISO 8601 timestamp of this bucket"),
      }),
    )
    .min(1, "query results contained no series buckets"),
});

function unixSeconds(milliseconds: number) {
  return Math.floor (milliseconds / 1000)
}

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
  queryResult: z
    .object({
      content: z.array(
        z.object({ type: z.string(), text: z.string().optional() }),
      ),
    })
    .nullable()
    .default(null),
  queryResults: HCQueryResultsSchema.nullable().default(null),
  summaryString: z.string().default(""),
  report: telemetryFindingsSchema.optional(),
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

const verify = createStep({
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
const redact = createStep({
  id: "scrub-alert",
  description:
    "Remove context to keep info from Agent, with goal of improving investigation",
  inputSchema: alertContextSchema,
  outputSchema: alertContextSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, state, setState }) => {
    if (env.NODE_ENV === "development") {
      const redacted = { ...inputData, triggerUrl: "" };
      await setState({ ...state, alertContext: redacted });
      return redacted;
    }
    return inputData;
  },
});

const getQueryResults = createStep({
  id: "get-query-results",
  description: "Get query results via API",
  inputSchema: alertContextSchema,
  outputSchema: ResourceLinkSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, state, setState }) => {
    const tool = honeycomb_get_query_results;
    if (!tool.execute) throw new Error("get_query_results has no execute()");
    const queryResult = await tool.execute({ url: inputData.resultUrl }, {});
    await setState({ ...state, queryResult });
    return queryResult;
  },
});

const getQueryResultsJson = createStep({
  id: "get-query-results-json",
  description: "Read and validate the JSON resource_link from query results",
  inputSchema: ResourceLinkSchema,
  outputSchema: HCQueryResultsSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, state, setState, tracingContext }) => {
    const span = tracingContext?.currentSpan;
    // The previous step returns the tool's { content: [...] } envelope, which
    // includes a resource_link to the raw query results as JSON.
    const link = inputData.content.find(
      (c): c is McpResourceLink =>
        c.type === "resource_link" && c.mimeType === "application/json",
    );
    if (!link?.uri) throw new Error("no JSON resource_link in query results");

    const res = await mvpMcpClient.resources.read("honeycomb", link.uri);

    span?.update({ metadata: { "workflow_step.tktk": JSON.stringify(res) } });

    const content = res.contents[0];
    if (!("text" in content)) {
      throw new Error("query results resource returned non-text content");
    }
    const t = JSON.parse(content.text);
    const queryResults = HCQueryResultsSchema.parse(t);

    await setState({ ...state, queryResults });
    return queryResults;
  },
});

/**
 * TODO: METHOD FOR CALCULATING T1 AND T4 IS VERY ROUGH AND SHOULD BE IMPROVED
 * PROBABLY WARRANTS A SUBAGENT CALL?
 */
const extractTimestamps = createStep({
  id: "extract-timestamps",
  description: "Extract timestamps from the gathered context",
  inputSchema: HCQueryResultsSchema,
  outputSchema: workflowStateSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ state, setState }) => {
    const series = state.queryResults?.series;
    if (!series?.length) {
      throw new Error("extractTimestamps: queryResults.series is empty");
    }
    const firstMs = Date.parse(series[0].time);
    const lastMs = Date.parse(series[series.length - 1].time);
    if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) {
      throw new Error(
        `extractTimestamps: invalid series timestamps (${series[0].time} / ${series[series.length - 1].time})`,
      );
    }
    const queryDuration = lastMs - firstMs;
    const t3 = String(unixSeconds(lastMs));

    // TODO - T1 AND T4 NEED IMPROVEMENT
    const t1 = String(unixSeconds(firstMs - queryDuration * 3));
    const t4 = String(unixSeconds(lastMs + queryDuration * 2));

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

const createAlertContextualizedAlertString = createStep({
  id: "return-state",
  description: "Return the workflow state.  Discard input",
  inputSchema: workflowStateSchema,
  outputSchema: z.string(),
  stateSchema: workflowStateSchema,
  execute: async ({ state, setState }) => {
    const textResult = state.queryResult?.content.find(
      (item) => item.type === "text",
    )?.text;

    const summaryString = `
# Summary
Alert timestamp: ${state.t3} 
Environment name: ${state.alertContext?.environment}
Trigger name: ${state.alertContext?.triggerName}

## Alert description created by the user:
<missing></missing>

## An automated description of this specific alert:
${state.alertContext?.description}

# What datasets were in the scope of this query?
${JSON.stringify(state.alertContext?.datasets)}

Keep in mind that it may be helpful to examine other datasets.

# Important timestamps
| Marker | Description | Time (unixSeconds) |
|--------|-------------|--------------------|
| T1 | Beginning of investigation window | ${state.t1} |
| T2 | About when did the problem begin? | ${state.t2} |
| T3 | When did the alert fire? | ${state.t3} |
| T4 | End of investigation window | ${state.t4} |

IMPORTANT: T1 and T4 are approximate.  Start your investigation between those timestamps, but feel free to expand your investigation if you deem necessary

# Full query results

<QUERY_RESULTS>
${textResult}
</QUERY_RESULTS>
`;
    setState({ ...state, summaryString });
    return summaryString;
  },
});

const investigate = createStep({
  id: "investigate",
  stateSchema: workflowStateSchema,
  inputSchema: z.string(),
  outputSchema: telemetryFindingsSchema,
  execute: async ({ inputData, mastra, state, setState }) => {
    if (!state.summaryString?.length) {
      throw new Error("Invalid workflow state");
    }

    const telAgent = mastra.getAgentById("telemetry-agent");
    const response = await telAgent.generate(inputData, {
      structuredOutput: {
        schema: telemetryFindingsSchema,
      },
    });

    if (!response.object) {
      throw new Error("generateReport: invalid agent output");
    }
    const report = response.object;
    setState({ ...state, report });
    return report;
  },
});

const returnWorkflowState = createStep({
  id: "return-state",
  description: "Return the workflow state.  Discard input",
  inputSchema: z.any(),
  outputSchema: workflowStateSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ state }) => {
    return state;
  },
});

export const alertIntake = createWorkflow({
  id: "alert-intake",
  stateSchema: workflowStateSchema,
  inputSchema: honeycombWebhookPayloadSchema,
  outputSchema: z.union([
    filteredOutcomeSchema,
    alertContextSchema, // placeholder: replace with Report schema later
  ]),
})
  .then(verify)
  .map(async ({ inputData }) => {
    if ("kind" in inputData && inputData.kind === "filtered") {
      throw new Error(
        "This error should never throw.  Looks like bail() didn't work?",
      );
    }
    return inputData;
  })
  .then(normalizeStep)
  .then(redact)
  .then(getQueryResults)
  .then(getQueryResultsJson)
  .then(extractTimestamps)
  .then(createAlertContextualizedAlertString)
  .then(investigate)
  .then(returnWorkflowState)
  .commit();
