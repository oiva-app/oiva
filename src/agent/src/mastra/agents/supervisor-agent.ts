import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { supervisorPrompt } from "../prompts/supervisor-prompt";
import { codebaseInvestigator } from "./codebase-agent";
import { threeServicesCodebaseInvestigator } from "./codebase-agent-three-services"
import { telemetryAgent } from "./telemetry-agent";
import { env } from "../config/env"
import { supervisorThreeServicesDemoWorkspace } from "../workspaces/codebase-three-services";

export const supervisorAgent = new Agent({
  id: "supervisor-agent",
  name: "Supervisor Agent",
  instructions: supervisorPrompt,
  model: "openai/gpt-5.4",
  agents: { threeServicesCodebaseInvestigator, telemetryAgent },
  memory: new Memory(),
  defaultOptions: {
    maxSteps: env.SUPERVISOR_MAX_STEPS,
    disableBackgroundTasks: true,
    delegation: {
      onDelegationStart: ({ primitiveId }) => {
        return { modifiedMaxSteps: 15 };
      },
    },
  },
  workspace: supervisorThreeServicesDemoWorkspace,
});
