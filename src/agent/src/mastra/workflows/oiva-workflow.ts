import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { alertContextSchema } from "../types/alert-context";
import {
  telemetryStepOutputSchema,
  telemetryFindingsSchema,
  codebaseInvestigatorOutputSchema,
  supervisorAgentOutputSchema,
} from "../types/investigation";
import { incidentReportSchema, reportAgentOutputSchema } from "../types/report";
import {
  postReportSummary,
  uploadFileToThread,
  postErrorMessage,
  postErrorToThread,
} from "../slack/client";
import { incidentRepository, reportRepository } from "../repositories";
import { assertTransition } from "../domain/incident-state";
import type { IncidentStatus } from "../ports/incident-repository";

const oivaWorkflowInputSchema = z.object({
  incidentId: z.string().uuid(),
  alertContext: alertContextSchema,
});

const oivaWorkflowStateSchema = z.object({
  incidentId: z.string().uuid().optional(),
  alertContext: alertContextSchema.optional(),
});

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
}

const investigate = createStep({
  id: "investigate",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: oivaWorkflowInputSchema,
  outputSchema: supervisorAgentOutputSchema,
  execute: async ({ inputData, mastra, setState }) => {
    const { incidentId, alertContext } = inputData;

    await transitionIncident(incidentId, "investigating");
    await setState({ incidentId, alertContext });

    const supervisorAgent = mastra.getAgentById("supervisor-agent");
    const response = await supervisorAgent.generate(
      JSON.stringify(alertContext, null, 2),
      {
        structuredOutput: {
          schema: supervisorAgentOutputSchema,
        },
      },
    );

    return response.object;
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
    } catch (e) {
      console.error(e);
      await postErrorMessage(state.alertContext);
      // TODO: mark incident row as failed (no report row will be created)? how to handle?
      throw e;
    }

    const report = response.object;

    let persistedReport;
    try {
      persistedReport = await reportRepository.insert({
        incidentId: state.incidentId,
        reportJson: report,
      });
    } catch (err) {
      console.error("generateReport: failed to insert report", err);
      await postErrorMessage(state.alertContext);
      throw err;
    }

    await transitionIncident(state.incidentId, "report_generated");

    return { id: persistedReport.id, ...report };
  },
});

const sendReportToSlack = createStep({
  id: "send-report",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: incidentReportSchema,
  outputSchema: z.string(),
  execute: async ({ inputData, state }) => {
    if (!state.alertContext || !state.incidentId) {
      throw new Error(
        "sendReportToSlack: alert context or incident id unavailable",
      );
    }

    const resultUrl = state.alertContext.resultUrl;
    const threadData = await postReportSummary(inputData, resultUrl);
    const { ts, channel } = threadData;

    try {
      await reportRepository.attachSlackMessage(inputData.id, {
        slackMessageId: ts,
        slackChannelId: channel,
      });
    } catch (err) {
      console.error("sendReportToSlack: failed to persist slack ids", {
        reportId: inputData.id,
        ts,
        err,
      });
    }

    try {
      await uploadFileToThread(ts, inputData);
      console.log(`Full report uploaded to thread, ts: ${ts}`);
    } catch (e) {
      console.error(e);
      await postErrorToThread(ts);
    }

    await transitionIncident(state.incidentId, "report_delivered");

    return ts;
  },
});

export const oivaWorkflow = createWorkflow({
  id: "oiva-workflow",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: oivaWorkflowInputSchema,
  outputSchema: z.string(),
})
  .then(investigate)
  .then(generateReport)
  .then(sendReportToSlack)
  .commit();
