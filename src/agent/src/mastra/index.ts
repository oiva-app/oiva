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
import { reportAgent } from "./agents/report-agent";
import { supervisorAgent } from "./agents/supervisor-agent";
import { telemetryAgent } from "./agents/telemetry-agent";
import { codebaseAgent } from "./agents/codebase-agent";
import { registerApiRoute } from "@mastra/core/server";
import { alertHookHandler } from "./api/honeycomb-hook-handler";
import { slackInteractionHandler } from "./api/slack-interaction-handler";
import { env } from "./config/env";
import {
  alertEnrich,
  contextualizeUsingHoneycombMCP,
} from "./workflows/alert-enrich";
import { startCleanupReaper } from "./services/cleanup-service-scheduler";
import { installShutdownSignalHandlers } from "@/runtime/shutdown-state";

installShutdownSignalHandlers();

const mastraStorageUrl =
  env.NODE_ENV === "production" ? "file:/tmp/mastra/mastra.db" : "file:./mastra.db";
const observabilityStoragePath =
  env.NODE_ENV === "production" ? "/tmp/mastra/mastra.duckdb" : "mastra.duckdb";

export const mastra = new Mastra({
  workflows: {
    oivaWorkflow,
    alertEnrich,
    contextualize: contextualizeUsingHoneycombMCP,
  },
  agents: {
    reportAgent,
    supervisorAgent,
    telemetryAgent,
    codebaseAgent,
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
