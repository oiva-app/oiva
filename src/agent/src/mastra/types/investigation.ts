import { z } from "zod";
import { alertContextSchema } from "./alert-context";

// this is a type used within the telemetryFindingsSchema below (produced by the tele agent loop) in order to highlight the main signals pulled from the telemetry data

const timeWindowSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
});

const keySignalSchema = z.object({
  signalType: z.enum([
    // categorizes what type of metric or behavior changed
    "error_rate", // error rate increase, eg. failed requests,exception count increased
    "latency", // response time shift
    "throughput", // request volume or processing rate change
    "saturation", // a resource approaching or hitting a limit, e.g. connection pool or queue depth
    "change_event", // something in the environment changed (flexible based on app instrumentation)
    "anomaly", // catch-all for signals that don’t fit the other categories
  ]),
  description: z.string(), // supports the type, eg. "p99 latency on payment-gateway /charge endpoint went from 210ms to 3.2s." instead of just ‘latency increased’
  service: z.string(), // service the signal was observed on
  operation: z.string().nullable(), // a pointer beyond which service is affected: e.g. a specific endpoint, span name or function the codebase agent can see, optional if not found
  severity: z.enum(["critical", "warning", "info"]), // an indicator for how impactful the signal is, helps code agent prioritize which signals to investigate first when there are several
  metricComparison: z
    .object({
      // used to form severity, informs codebase agent
      baseline: z.number(),
      current: z.number(),
      unit: z.string(),
    })
    .nullable(),
  timeWindow: timeWindowSchema.nullable(), // optional timeframe for when the signal can be observed
  correlatedAttributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .nullable(),

  //z.record(z.string(), z.string()).nullable(), // the attributes that meaningfully differ from baselines, the agent can pull these from calling run_bubbleup
});

// a shape used in telemetryFindingsSchema for specific telemetry samples
const telemetrySampleSchema = z.object({
  sourceType: z.enum(["trace", "span", "log"]),

  // pointers for human review, the code agent ignores these since it can’t query HC
  traceId: z.string().nullable(),
  spanId: z.string().nullable(),

  // what the code agent actually uses
  service: z.string(),
  operation: z.string().nullable(), // span name, log source, handler
  summary: z.string(), // tele agent's interpretation of why this piece of telemetry data matters
  attributes: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .nullable(),
  timestamp: z.iso.datetime().nullable(),
});

// produced by the agentic telemetry agent loop within step 4.1
const telemetryFindingsSchema = z.object({
  hypothesis: z.string(), // statement of what it thinks is going wrong and why based on findings
  confidence: z.enum(["high", "medium", "low"]), // tells code agent how strong the evidence is, guiding how much it can narrow the search
  onset: z.iso.datetime().nullable(), // the earliest point an anomaly was detected in tele data, points code agent to code change timelines
  keySignals: z.array(keySignalSchema).min(1), // specific observed anomalies found in data that point code agent to specific timeframes where the anomalies started occurring
  suspectServices: z.array(z.string()).min(1), // instant lookup for affected services
  telemetrySamples: z.array(telemetrySampleSchema).max(5).nullable(), // specific spans, traces, logs pulled from HC when relevant
  relevantErrorPatterns: z.array(z.string()).nullable(), // specific error messages, exception types, status codes, code agent can search where these get thrown in the code
  ruledOut: z.array(z.object({ what: z.string(), why: z.string() })).nullable(), // what tele agent investigated and eliminated so code agent doesn’t have to cover that ground again
  gaps: z.array(z.string()).nullable(), // what tele agent wanted to check but couldn’t, admits incompleteness of the findings so code agent knows what else to check
});

// the structured output from step 4.1. (that wraps the agent loop)
// combines the alert and findings from the wrapped tele agent loop

const telemetryStepOutputSchema = z.object({
  alert: alertContextSchema,
  telemetryFindings: telemetryFindingsSchema, // tele agent’s findings
});

export const investigationToolCallSchema = z.object({
  toolName: z.string().describe("Which tool was called?"),
  toolUseIntent: z
    .string()
    .describe("What question is this tool call meant to answer?"),
  toolInput: z.object({}).loose(),
  toolOutput: z.object({}).loose(),
  queryUrl: z.string().default(""),
  error: z.boolean(), 
});

export const investigationTraceSchema = z.array(investigationToolCallSchema);
export type InvestigationTrace = z.infer<typeof investigationTraceSchema>;

// Type acrobatics to deal with mismatch btw input and output types
// TODO - is there a better way?
export type InvestigationStep = Pick<
  InvestigationTrace[number],
  "toolName" | "toolUseIntent" | "error"
> & { queryUrl?: string };

export { telemetryFindingsSchema, telemetryStepOutputSchema };
export type TelemetryFindings = z.infer<typeof telemetryFindingsSchema>;
export type TelemetryStepOutput = z.infer<typeof telemetryStepOutputSchema>;

const potentialProblemSchema = z
  .object({
    description: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
    file: z.string().nullable(),
    line_range: z.array(z.number()).nullable(),
    snippet: z.string().nullable(), // the relevant code, not a reproduction
    reasoning: z.string(), // why this code is connected to the telemetry signal
  })
  .nullable(); // nullable = agent found nothing conclusive

const recommendedFixSchema = z
  .object({
    description: z.string(), // what to change and why
    file: z.string().nullable(),
    line_range: z.array(z.number()).nullable(),
    snippet: z.string().nullable(), // suggested corrected code
    confidence: z.enum(["high", "medium", "low"]),
    caveat: z.string().nullable(), // "this fix addresses the symptom but root cause may be upstream", etc.
  })
  .nullable(); // null if verdict isn't problem_found

export const codebaseInvestigatorOutputSchema = z.object({
  verdict: z.enum([
    "problem_found",
    "inconclusive",
    "no_problem_found",
    "needs_escalation",
  ]),
  summary: z.string(),
  potential_problem: potentialProblemSchema, // null if verdict isn't problem_found
  recommended_fix: recommendedFixSchema,
});

export const supervisorAgentOutputSchema = z.object({
  summary: z
    .string()
    .describe(
      "A concise 2-3 sentence description of the incident: what is happening, which service is affected, when it started, and the current severity.",
    ),
  hypothesis: z.object({
    category: z
      .enum([
        "code_change",
        "infrastructure",
        "traffic_pattern",
        "external_dependency",
        "configuration",
        "inconclusive",
      ])
      .describe("A categorization of the incident type."),
    description: z
      .string()
      .describe(
        "Your leading theory stated as a causal chain — what caused what, and why.",
      ),
    confidence: z
      .enum(["high", "medium", "low"])
      .describe("The confidence level for the suggested hypothesis."),
    evidence_for: z
      .array(z.string())
      .describe(
        "Findings that support this hypothesis, with source attribution (telemetry or codebase).",
      ),
    evidence_against: z
      .array(z.string())
      .nullable()
      .describe(
        "Findings that weigh against alternative explanations, including negative results like 'no recent deployments found'.",
      ),
  }),
  next_steps: z.array(
    z.object({
      action: z
        .string()
        .describe(
          "A specific, actionable recommendation for the engineer to further investigate or resolve the issue.",
        ),
      rationale: z
        .string()
        .describe("An explanation for why this step matters."),
      priority: z
        .enum(["immediate", "short_term", "follow_up"])
        .describe("A categorization of how urgent the suggested step is."),
    }),
  ),
});

export type SupervisorAgentOutput = z.infer<typeof supervisorAgentOutputSchema>;
