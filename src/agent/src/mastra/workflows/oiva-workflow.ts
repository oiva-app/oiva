import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { alertContextSchema } from "../types/alert-context";
import {
  telemetryStepOutputSchema,
  telemetryFindingsSchema,
  codebaseInvestigatorOutputSchema,
  supervisorAgentOutputSchema,
} from "../types/investigation";
import { incidentReportSchema } from "../types/report";

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
