import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from "@mastra/core/storage";
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";

import { oivaWorkflow } from "./workflows/oiva-workflow";
import { weatherWorkflow } from "./workflows/weather-workflow";
import { helloWorldAgent } from "./agents/oiva1-agent";
import { oiva2 } from "./agents/oiva2-agent";
import { reportAgent } from "./agents/report-agent";
import { weatherAgent } from "./agents/weather-agent";
import { supervisorAgent } from "./agents/supervisor-agent";
import { telemetryAgent } from "./agents/telemetry-agent";
import { codebaseAgent } from "./agents/codebase-agent";
// import {
//   toolCallAppropriatenessScorer,
//   completenessScorer,
//   translationScorer,
// } from "./scorers/weather-scorer";
import { registerApiRoute } from "@mastra/core/server";
import { alertHookHandler } from "./api/honeycomb-hook-handler";
import { slackInteractionHandler } from "./api/slack-interaction-handler";
import { env } from "./config/env";
import {
  alertEnrich,
  contextualizeUsingHoneycombMCP,
} from "./workflows/alert-enrich";
import { testAgent } from "./agents/test-agent";
import { startCleanupReaper } from "./services/cleanup-service-scheduler";
import { installShutdownSignalHandlers } from "./services/shutdown-state";

installShutdownSignalHandlers();

const mastraStorageUrl =
  env.NODE_ENV === "production" ? "file:/tmp/mastra/mastra.db" : "file:./mastra.db";
const observabilityStoragePath =
  env.NODE_ENV === "production" ? "/tmp/mastra/mastra.duckdb" : "mastra.duckdb";

export const mastra = new Mastra({
  workflows: {
    oivaWorkflow,
    weatherWorkflow,
    alertEnrich,
    contextualize: contextualizeUsingHoneycombMCP,
  },
  agents: {
    helloWorldAgent,
    weatherAgent,
    oiva2,
    reportAgent,
    supervisorAgent,
    telemetryAgent,
    codebaseAgent,
    testAgent,
  },
  scorers: {},
  server: {
    apiRoutes: [
      registerApiRoute("/hook/honeycomb/alert", {
        method: "POST",
        handler: alertHookHandler,
      }),
      registerApiRoute("/hook/slack/interaction", {
        method: "POST",
        handler: slackInteractionHandler,
      }),
    ],
  },
  storage: new MastraCompositeStore({
    id: "composite-storage",
    default: new LibSQLStore({
      id: "mastra-storage",
      url: mastraStorageUrl,
    }),
    domains: {
      observability: await new DuckDBStore({
        path: observabilityStoragePath,
      }).getStore("observability"),
    },
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: "mastra",
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
          new OtelExporter({
            provider: {
              custom: {
                endpoint: env.COLLECTOR_ENDPOINT,
                protocol: "http/protobuf",
              },
            },
          }),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});

startCleanupReaper({ logger: mastra.getLogger() });
