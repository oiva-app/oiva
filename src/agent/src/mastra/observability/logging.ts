import { Transform } from "node:stream";
import { PinoLogger } from "@mastra/loggers";
import { createCustomTransport } from "@mastra/core/logger";
import {
  LoggerProvider,
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { SeverityNumber, type AnyValueMap } from "@opentelemetry/api-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

// MUST match the trace exporter's serviceName (see mastra/index.ts Observability
// config) so logs land in the SAME Honeycomb dataset as the spans.
const SERVICE_NAME = "mastra";

// COLLECTOR_ENDPOINT is the signal-specific traces URL (…/v1/traces). Derive the
// sibling logs endpoint. Read process.env directly to keep this bootstrap module
// free of the config/env.ts import (which logs at load time → avoids a cycle).
function deriveLogsEndpoint(): string {
  const base = (
    process.env.COLLECTOR_ENDPOINT ?? "http://localhost:4318/v1/traces"
  ).replace(/\/+$/, "");
  return base.replace(/\/v1\/(traces|logs|metrics)$/, "") + "/v1/logs";
}

const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({ "service.name": SERVICE_NAME }),
  processors: [
    new BatchLogRecordProcessor(
      new OTLPLogExporter({ url: deriveLogsEndpoint() }),
    ),
  ],
});

const otelLogger = loggerProvider.getLogger("oiva-agent");

// pino numeric levels → OTel SeverityNumber
const SEVERITY: Record<number, SeverityNumber> = {
  10: SeverityNumber.TRACE,
  20: SeverityNumber.DEBUG,
  30: SeverityNumber.INFO,
  40: SeverityNumber.WARN,
  50: SeverityNumber.ERROR,
  60: SeverityNumber.FATAL,
};
const SEVERITY_TEXT: Record<number, string> = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

function toOtelLogRecord(line: string) {
  const rec = JSON.parse(line) as Record<string, unknown>;
  if (!rec || typeof rec !== "object") return;

  const level = typeof rec.level === "number" ? rec.level : 30;
  // Everything except pino's reserved fields becomes a (high-cardinality) log
  // attribute — incidentId, runId, reason, etc. all become queryable columns.
  const {
    level: _l,
    time: _t,
    msg,
    pid: _p,
    hostname: _h,
    name: _n,
    ...attributes
  } = rec;
  otelLogger.emit({
    timestamp: typeof rec.time === "number" ? rec.time : Date.now(),
    severityNumber: SEVERITY[level] ?? SeverityNumber.INFO,
    severityText: SEVERITY_TEXT[level] ?? "INFO",
    body: typeof msg === "string" ? msg : JSON.stringify(msg ?? ""),
    attributes: attributes as AnyValueMap,
    // No explicit context passed → emit() captures context.active(). If Mastra
    // spans don't set the OTel active context, logs still correlate to traces
    // via the incidentId/runId attributes above (same dataset).
  });
}

function createOtelBridgeTransport() {
  const stream = new Transform({
    objectMode: true, // pino multistream writes one JSON line per record
    transform(chunk, _enc, callback) {
      try {
        const line = chunk.toString("utf8").trim();
        if (line) toOtelLogRecord(line);
      } catch {
        // Never let a malformed line crash logging; it still reached stdout below.
      }
      callback(null, chunk); // pass through so the pretty/stdout stream still prints
    },
  });
  return createCustomTransport(stream);
}

/**
 * The single application logger. Import this everywhere (including bootstrap /
 * signal / pool contexts that have no Mastra instance). Also passed to Mastra so
 * framework logs flow through the same OTLP bridge.
 */
export const logger = new PinoLogger({
  name: "Mastra",
  level: (process.env.LOG_LEVEL as never) ?? "info",
  transports: { otlp: createOtelBridgeTransport() },
});

/** Flush buffered OTLP logs before the process exits (call on SIGTERM). */
export async function shutdownLogs(): Promise<void> {
  await loggerProvider.shutdown().catch(() => undefined);
}
