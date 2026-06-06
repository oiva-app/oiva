import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { RequestContext } from "@mastra/core/request-context";

import { alertContextSchema } from "../types/alert-context";
import {
  investigationTraceSchema,
  supervisorAgentOutputSchema,
} from "../types/investigation";
import { incidentReportSchema, reportAgentOutputSchema } from "../types/report";
import { progressReporter } from "@/slack";
import { formatInvestigationSteps } from "../slack/formatters";
import {
  alertRepository,
  incidentRepository,
  reportRepository,
} from "../repositories";
import { assertTransition } from "../domain/incident-state";
import { incidentDurationMs } from "../domain/incident-duration";
import { threadIdForIncident } from "../domain/incident-thread";
import type { IncidentStatus } from "../ports/incident-repository";
import { failIncident as failIncidentService } from "../services/incident-service";
import { env } from "../config/env";
import {
  cleanupCodebaseAgentWorkspace,
  prepareCodebaseAgentWorkspace,
} from "../workspaces/codebase-workspace";
import {
  prepareSupervisorWorkspace,
  cleanupSupervisorWorkspace,
} from "../workspaces/supervisor-workspace";
import { syncKnowledgeBaseForIncident } from "../workspaces/knowledge-base-sync";

/*
z.string.uuid() is deprecated per https://zod.dev/api?id=uuids#uuids
Use `z.uuid()` instead
*/
const oivaWorkflowInputSchema = z.object({
  incidentId: z.uuid(),
  alertContext: alertContextSchema,
});

export const oivaWorkflowStateSchema = z.object({
  incidentId: z.uuid().optional(),
  alertContext: alertContextSchema.optional(),
  investigationTrace: investigationTraceSchema.default([]),
});

const RESOURCE_ID = `${env.OBSERVED_APP_NAME}:investigation`;

/**
 * To move an incident to a new status, first assert the transition is legal
 * per the domain state function.
 * Reads current status from the DB rather than trusting workflow state.
 */
async function transitionIncident(
  incidentId: string,
  to: IncidentStatus,
): Promise<void> {
  const incident = await incidentRepository.findById(incidentId);
  if (!incident) {
    throw new Error(`transitionIncident: incident ${incidentId} not found`);
  }
  if (incident.status === to) {
    return;
  }
  assertTransition(incident.status, to);
  await incidentRepository.updateStatus(incident.id, to);
  await progressReporter.statusChanged(incidentId, to);
}

function failureReason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function failIncident(incidentId: string, reason: string): Promise<void> {
  await failIncidentService(incidentId, reason, {
    incidents: incidentRepository,
    reporter: progressReporter,
  });
}

export const announce = createStep({
  id: "announce",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: oivaWorkflowInputSchema,
  outputSchema: oivaWorkflowInputSchema,
  execute: async ({ inputData }) => {
    const { incidentId, alertContext } = inputData;

    await progressReporter.incidentOpened(incidentId, alertContext);
    await progressReporter.milestone(incidentId, "Alert verified");
    return inputData;
  },
});

const investigate = createStep({
  id: "investigate",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: oivaWorkflowInputSchema,
  outputSchema: supervisorAgentOutputSchema,
  execute: async ({ inputData, mastra, setState }) => {
    const { incidentId, alertContext } = inputData;
    const threadId = threadIdForIncident(incidentId);
    const requestContext = new RequestContext();
    requestContext.set("incidentId", incidentId);
    requestContext.set("alertContext", alertContext);

    await transitionIncident(incidentId, "investigating");
    await setState({ incidentId, alertContext });
    const supervisorAgent = mastra.getAgentById("supervisor-agent");

    try {
      await syncKnowledgeBaseForIncident(incidentId);
      await prepareCodebaseAgentWorkspace(incidentId);
      await prepareSupervisorWorkspace(incidentId);

      const response = await supervisorAgent.generate(
        JSON.stringify(alertContext, null, 2),
        {
          structuredOutput: {
            schema: supervisorAgentOutputSchema,
          },
          memory: {
            thread: threadId,
            resource: RESOURCE_ID,
          },
          requestContext,
        },
      );

      /*
      Question: why don't we simply do `...state` here?  
      Answer: It will not contain the incidentId or other values that are set in the lines above
      */
      await setState({
        incidentId,
        alertContext,
        investigationTrace: requestContext.get("investigationTrace") ?? [],
      });

      await progressReporter.milestone(incidentId, "Investigation concluded");

      return response.object;
    } catch (err) {
      await failIncident(incidentId, failureReason(err));
      throw err;
    } finally {
      try {
        const memory = await supervisorAgent.getMemory();
        await memory?.deleteThread(threadId);
      } catch (err) {
        mastra
          .getLogger()
          .error("supervisor memory cleanup failed", { incidentId, err });
      } finally {
        await cleanupSupervisorWorkspace(incidentId);
        await cleanupCodebaseAgentWorkspace(incidentId);
      }
    }
  },
});

const generateReport = createStep({
  id: "report",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: supervisorAgentOutputSchema,
  outputSchema: incidentReportSchema,
  execute: async ({ inputData, mastra, state }) => {
    if (!state.alertContext || !state.incidentId) {
      throw new Error(
        "generateReport: alert context or incident id unavailable",
      );
    }

    await transitionIncident(state.incidentId, "report_in_process");

    const reportInput = {
      findings: inputData,
      alertContext: state.alertContext,
    };

    const reportAgent = mastra.getAgentById("report-agent");
    let response;
    const reportStartedAt = Date.now();
    await progressReporter.delegationStarted(state.incidentId, "report");
    try {
      response = await reportAgent.generate(
        JSON.stringify(reportInput, null, 2),
        {
          structuredOutput: {
            schema: reportAgentOutputSchema,
          },
        },
      );

      if (!response.object) {
        throw new Error("generateReport: invalid agent output");
      }
    } catch (err) {
      console.error(err);
      await failIncident(state.incidentId, failureReason(err));
      throw err;
    }

    await progressReporter.delegationCompleted(state.incidentId, "report", {
      durationMs: Date.now() - reportStartedAt,
      success: true,
    });

    const report = response.object;
    const investigationSteps = formatInvestigationSteps(
      state.investigationTrace ?? [],
    );

    let persistedReport;
    try {
      persistedReport = await reportRepository.insert({
        incidentId: state.incidentId,
        reportJson: { ...report, investigationSteps },
      });
    } catch (err) {
      console.error("generateReport: failed to insert report", err);
      await failIncident(state.incidentId, failureReason(err));
      throw err;
    }

    const startedAt = await alertRepository.firstReceivedAt(state.incidentId);
    const durationMs = startedAt
      ? incidentDurationMs(startedAt, persistedReport.generatedAt)
      : null;

    await transitionIncident(state.incidentId, "report_generated");

    return {
      id: persistedReport.id,
      durationMs,
      ...report,
      investigationSteps,
    };
  },
});

const sendReportToSlack = createStep({
  id: "send-report",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: incidentReportSchema,
  outputSchema: z.string(),
  execute: async ({ inputData, state, requestContext }) => {
    if (!state.alertContext || !state.incidentId) {
      throw new Error(
        "sendReportToSlack: alert context or incident id unavailable",
      );
    }

    const incidentId = state.incidentId;
    const resultUrl = state.alertContext.resultUrl;

    await transitionIncident(incidentId, "report_delivered");

    await progressReporter.reportReady(incidentId, inputData, resultUrl);
    await progressReporter.attachReportFile(incidentId, inputData);

    const incident = await incidentRepository.findById(incidentId);
    if (incident?.slackThreadTs && incident.slackChannelId) {
      try {
        await reportRepository.attachSlackMessage(inputData.id, {
          slackMessageId: incident.slackThreadTs,
          slackChannelId: incident.slackChannelId,
        });
      } catch (err) {
        console.error("sendReportToSlack: failed to persist slack ids", {
          reportId: inputData.id,
          err,
        });
      }
    }

    return incident?.slackThreadTs ?? "";
  },
});

export const oivaWorkflow = createWorkflow({
  id: "oiva-workflow",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: oivaWorkflowInputSchema,
  outputSchema: z.string(),
})
  .then(announce)
  .then(investigate)
  .then(generateReport)
  .then(sendReportToSlack)
  .commit();
