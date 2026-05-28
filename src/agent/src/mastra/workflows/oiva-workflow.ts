import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { alertContextSchema } from "../types/alert-context";
import { supervisorAgentOutputSchema,} from "../types/investigation";
import { incidentReportSchema } from "../types/report";
import { env } from "../config/env"

const oivaWorkflowStateSchema = z.object({
  alertContext: alertContextSchema.optional(),
});

const RESOURCE_ID = `${env.OBSERVED_APP_NAME}:investigation`;

const investigate = createStep({
  id: "investigate",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: alertContextSchema,
  outputSchema: supervisorAgentOutputSchema,
  execute: async ({ inputData, mastra, setState }) => {
    // placeholder for real incident id
    const incidentId = Math.floor(Math.random() * (10000000000000000000)) + 1;
    const threadId = `incident:${incidentId}`;

    const supervisorAgent = mastra.getAgentById("supervisor-agent");
    const response = await supervisorAgent.generate(
      JSON.stringify(inputData, null, 2),
      {
        structuredOutput: {
          schema: supervisorAgentOutputSchema,
        },
        memory: {
          thread: threadId,
          resource: RESOURCE_ID,
        }
      },
    );
    await setState({ alertContext: inputData });
    // release thread from local storage
    const memory = await supervisorAgent.getMemory();
    await memory?.deleteThread(threadId);
    return response.object;
  }
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
    const response = await reportAgent.generate(
      JSON.stringify(reportInput, null, 2),
      {
        structuredOutput: {
          schema: incidentReportSchema,
        },
      },
    );

    if (!response.object) {
      throw new Error("generateReport: invalid agent output");
    }

    const report = response.object;
    return report;
  },
});

export const oivaWorkflow = createWorkflow({
  id: "oiva-workflow",
  stateSchema: oivaWorkflowStateSchema,
  inputSchema: alertContextSchema,
  outputSchema: incidentReportSchema,
})
  .then(investigate)
  .then(generateReport)
  .commit();
