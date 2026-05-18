import { z } from "zod";
import { AlertContextSchema } from "./alert-context";

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
  correlatedAttributes: z.record(z.string(), z.string()).nullable(), // the attributes that meaningfully differ from baselines, the agent can pull these from calling run_bubbleup
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
  attributes: z // relevant key-value pairs pulled from the event from HC
    .record(z.string(), z.string())
    .nullable(),
  timestamp: z.iso.datetime().nullable(),
});

// produced by the agentic telemetry agent loop within step 4.1
const TelemetryFindingsSchema = z.object({
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

const TelemetryStepOutputSchema = z.object({
  alert: AlertContextSchema,
  telemetryFindings: TelemetryFindingsSchema, // tele agent’s findings
});

export { TelemetryFindingsSchema, TelemetryStepOutputSchema };
export type TelemetryFindings = z.infer<typeof TelemetryFindingsSchema>;
export type TelemetryStepOutput = z.infer<typeof TelemetryStepOutputSchema>;
