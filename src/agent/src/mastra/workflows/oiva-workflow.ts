import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

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

const oivaWorkflowStateSchema = z.object({
  alertContext: alertContextSchema.optional(),
});

const investigate = createStep({
  id: "investigate",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: alertContextSchema,
  outputSchema: supervisorAgentOutputSchema,
  execute: async ({ inputData, mastra, setState }) => {
    const supervisorAgent = mastra.getAgentById("supervisor-agent");
    const response = await supervisorAgent.generate(
      JSON.stringify(inputData, null, 2),
      {
        structuredOutput: {
          schema: supervisorAgentOutputSchema,
        },
      },
    );

    const findings = response.object;
    await setState({ alertContext: inputData });
    return findings;
  },
});

const generateReport = createStep({
  id: "report",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: supervisorAgentOutputSchema,
  outputSchema: incidentReportSchema,
  execute: async ({ inputData, mastra, state }) => {
    if (!state.alertContext) {
      throw new Error("generateReport: alert context unavailable");
    }

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
    // TODO: replace file write with db insert into reports table
    // id, incident_id, generated_at, report_json
    // incident_id from workflow state?

    const id = crypto.randomUUID();

    try {
      // TODO: replace with db insert once set up
      const reportsDir = path.resolve(process.cwd(), "reports");
      await fs.mkdir(reportsDir, { recursive: true });
      await fs.writeFile(
        path.join(reportsDir, `${id}.json`),
        JSON.stringify({ id, ...report }, null, 2),
        "utf-8",
      );
    } catch (err) {
      console.error("generateReport: failed to write report to file", err);
    }

    return { id, ...report };
  },
});

const sendReportToSlack = createStep({
  id: "send-report",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: incidentReportSchema,
  outputSchema: z.string(),
  execute: async ({ inputData, state }) => {
    if (!state.alertContext) {
      throw new Error("sendReportToSlack: alert context unavailable");
    }

    const resultUrl = state.alertContext.resultUrl;
    // TODO: if this throws, report row stays with null slack fields, how to handle?
    const threadTs = await postReportSummary(inputData, resultUrl);
    // TODO: update reports row (id = inputData.id)
    // set slack_message_id = threadTs, slack_channel_id = env.SLACK_CHANNEL_ID

    try {
      await uploadFileToThread(threadTs, inputData);
      console.log(`Full report uploaded to thread, ts: ${threadTs}`);
    } catch (e) {
      console.error(e);
      await postErrorToThread(threadTs);
    }

    return threadTs;
  },
});

export const oivaWorkflow = createWorkflow({
  id: "oiva-workflow",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: alertContextSchema,
  outputSchema: z.string(),
})
  .then(investigate)
  .then(generateReport)
  .then(sendReportToSlack)
  .commit();
