/*
TODO: 
  - Replace z.any() schemas with real schemas
*/

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { alertContextSchema, type AlertContext } from "../types/alert-context";
import { env } from "../config/env";
import { mvpMcpClient, honeycomb_get_query_results } from "../mcp/mcpClients";
import { ResourceLinkSchema, type McpResourceLink } from "../types/mcp";
import { telemetryFindingsSchema } from "../types/investigation";

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////
// SCHEMAS

// Shape returned by the Honeycomb MCP `get_query_results` tool's JSON
// resource_link.
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

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS

/**
 * TODO: CENTRALIZE THIS TIMEZONE CONFIG (currently hardcoded)
 * Convert all timestamps to GMT to keep things simple? Or maybe this would just complicate things?
 * What timezone does Honeycomb MCP expect??
 */
function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms))
    throw new Error(`formatTimestamp: invalid ms ${ms}`);
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const TIME_PLACEHOLDER = "unknown";

export const workflowStateSchema = z.object({
  alertContext: alertContextSchema, // This is the only required property
  queryResultOverview: z
    .object({
      content: z.array(
        z.object({ type: z.string(), text: z.string().optional() }),
      ),
    })
    .nullable()
    .default(null),
  queryResultDetail: HCQueryResultsSchema.nullable().default(null),
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

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////
/*
WORKFLOW STEPS

SOME OF THESE STEPS WOULD BE BETTER IMPLEMENTED USING THE HONEYCOMB API
INSTEAD OF THE HONEYCOMB MCP

However, the API requires an Enterprise license
*/

/**
 * It's possible / likely that this step should be omitted from production runs
 * It is helpful for testing with canned (stale alerts) and missing triggers
 * (triggers have been deleted to stay in free tier).
 */
const redact = createStep({
  id: "scrub-alert",
  description:
    "Remove context to keep info from Agent, with goal of improving investigation",
  inputSchema: workflowStateSchema,
  outputSchema: alertContextSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, state, setState }) => {
    if (env.NODE_ENV === "development") {
      const redacted = { ...inputData.alertContext, triggerUrl: "" };
      await setState({ ...state, alertContext: redacted });
      return redacted;
    }
    return inputData.alertContext;
  },
});

/**
 * What: Manually get_query_results from Honeycomb
 * Why: Agents seems to have a lot of trouble with this tool call
 */
export const getQueryResults = createStep({
  id: "get-query-results",
  description: "Get query results via API",
  inputSchema: alertContextSchema,
  outputSchema: ResourceLinkSchema,
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, state, setState }) => {
    const tool = honeycomb_get_query_results;
    if (!tool.execute) throw new Error("get_query_results has no execute()");
    const queryResult = await tool.execute({ url: inputData.resultUrl }, {});
    await setState({
      ...state,
      alertContext: inputData,
      queryResultOverview: queryResult,
    });
    return queryResult;
  },
});

/**
 * What: Get JSON from previous MCP call
 * Why: Previous MCP call doesn't include query `start` or `end` timestamps
 */
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

    span?.update({
      metadata: { "workflow_step.resource_link": JSON.stringify(res) },
    });

    const content = res.contents[0];
    if (!("text" in content)) {
      throw new Error("query results resource returned non-text content");
    }
    const t = JSON.parse(content.text);
    const queryResults = HCQueryResultsSchema.parse(t);

    await setState({ ...state, queryResultDetail: queryResults });
    return queryResults;
  },
});

/**
 * What: Extract timestamps from MCP Query Results
 * Why: LLM telemetry queries work better when ISO-formatted timestamps are provided
 *
 * Caution: Claude will claim that HC prefers unix seconds.  He is lying.
 *    Want to confirm?  Use .listTools() and examine the payload yourself.
 *
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
    const series = state.queryResultDetail?.series;
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
    const t3 = formatTimestamp(lastMs);

    // TODO - T1 AND T4 NEED IMPROVEMENT
    const t1 = formatTimestamp(firstMs - queryDuration * 3);
    const t4 = formatTimestamp(lastMs + queryDuration * 2);

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

/**
 * What: Creates an LLM-friendly version of the Alert
 * Why: better investigation outcomes than passing a raw alert JSON
 */
const createAlertContextualizedAlertString = createStep({
  id: "return-state",
  description: "Return the workflow state.  Discard input",
  inputSchema: workflowStateSchema,
  outputSchema: z.string(),
  stateSchema: workflowStateSchema,
  execute: async ({ state, setState }) => {
    const textResult = state.queryResultOverview?.content.find(
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
| Marker | Description | Time             |
|--------|-------------|------------------|
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

/**
 * A 'helper step' that dumps the workflowStateSchema to `output`
 */
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

function buildFallbackString(alertContext: AlertContext): string {
  return `
# Summary (fallback — contextualization unavailable)
Environment name: ${alertContext.environment}
Trigger name: ${alertContext.triggerName}

## An automated description of this specific alert:
${alertContext.description}

# What datasets were in the scope of this query?
${JSON.stringify(alertContext.datasets)}

NOTE: Honeycomb query results could not be retrieved, so timestamps and full
query results are unavailable. Investigate from the alert description above.
`;
}

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////
// WORKFLOW


export const contextualizeUsingHoneycombMCP = createWorkflow({
  id: "contextualize",
  inputSchema: alertContextSchema,
  outputSchema: z.string(),
  stateSchema: workflowStateSchema,
})
  .then(getQueryResults)
  .then(getQueryResultsJson)
  .then(extractTimestamps)
  .then(createAlertContextualizedAlertString)
  .commit();


const contextualizeOrFallback = createStep({
  id: "contextualize-or-fallback",
  description:
    "Contextualize the alert; fall back to a degraded summary on failure",
  inputSchema: alertContextSchema,
  outputSchema: z.string(),
  stateSchema: workflowStateSchema,
  execute: async ({ inputData, mastra }) => {
    try {
      const run = await mastra.getWorkflow("contextualize").createRun();
      const result = await run.start({ inputData });
      if (result.status === "success") return result.result;
    } catch (e) {
      
      return buildFallbackString(inputData);
    }
  },
});

export const alertEnrich = createWorkflow({
  id: "alert-enrich",
  stateSchema: workflowStateSchema,
  inputSchema: workflowStateSchema,
  outputSchema: z.string(),
})
  .then(redact)
  .then(contextualizeOrFallback)
  .commit();
