import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { supervisorPrompt } from "../prompts/supervisor-prompt";
import { codebaseAgent } from "./codebase-agent"
import { telemetryAgent } from "./telemetry-agent";
import { env } from "../config/env"
import { supervisorWorkspace } from "../workspaces/supervisor-workspace";

const SUBAGENTS = {
  "codebase-agent": codebaseAgent,
  "telemetry-agent": telemetryAgent,
} as const;

export const supervisorAgent = new Agent({
  id: "supervisor-agent",
  name: "Supervisor Agent",
  instructions: supervisorPrompt,
  model: "openai/gpt-5.4",
  agents: { codebaseAgent, telemetryAgent },
  memory: new Memory(),
  defaultOptions: {
    maxSteps: env.SUPERVISOR_MAX_STEPS,
    disableBackgroundTasks: true,
    delegation: {
      onDelegationStart: () => {
        return { modifiedMaxSteps: env.TELEMETRY_MAX_STEPS };  // maxSteps controls BOTH telAgent and codebaseAgent
      },
      // this is used to clean up subagent memory in local storage after an investigation
      onDelegationComplete: async ({ primitiveId, result }) => {
        if (!result?.subAgentThreadId || !Object.hasOwn(SUBAGENTS, primitiveId)) return;
        try {
          const subAgent = SUBAGENTS[primitiveId as keyof typeof SUBAGENTS];
          const memory = await subAgent.getMemory({});
          await memory?.deleteThread(result.subAgentThreadId);
        } catch (err) {
          const logContext = {
            primitiveId,
            subAgentThreadId: result.subAgentThreadId,
            err,
          };
          const logger = supervisorAgent.getMastraInstance()?.getLogger();
          logger?.error("subagent memory cleanup failed", logContext);
        }
      }
    },
  },
  workspace: supervisorWorkspace,
});
