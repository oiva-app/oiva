import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { supervisorPrompt } from "../prompts/supervisor-prompt";
import { codebaseInvestigator } from "./codebase-agent";
import { telemetryAgent } from "./telemetry-agent";
import { env } from "../config/env"

export const supervisorAgent = new Agent({
  id: "supervisor-agent",
  name: "Supervisor Agent",
  instructions: supervisorPrompt,
  model: "openai/gpt-5.4",
  agents: { codebaseInvestigator, telemetryAgent },
  memory: new Memory(),
  defaultOptions: {
    maxSteps: env.SUPERVISOR_MAX_STEPS,
    disableBackgroundTasks: true,
  },
});
