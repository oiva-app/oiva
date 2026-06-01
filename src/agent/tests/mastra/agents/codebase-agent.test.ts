import { describe, expect, it, vi } from "vitest";

const mockConstructors = vi.hoisted(() => ({
  Agent: vi.fn(function (config) {
    return { config };
  }),
  Memory: vi.fn(function (config) {
    return { config };
  }),
  ToolCallFilter: vi.fn(function (config) {
    return { config };
  }),
}));

vi.mock("@mastra/core/agent", () => ({
  Agent: mockConstructors.Agent,
}));

vi.mock("@mastra/memory", () => ({
  Memory: mockConstructors.Memory,
}));

vi.mock("@mastra/core/processors", () => ({
  ToolCallFilter: mockConstructors.ToolCallFilter,
}));

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    CODEBASE_MAX_STEPS: 12,
  },
}));

describe("codebaseAgent", () => {
  it("configures the codebase investigator agent", async () => {
    const { codebaseAgent } = await import(
      "../../../src/mastra/agents/codebase-agent"
    );
    const { prompt } = await import(
      "../../../src/mastra/prompts/system-prompt-codebase-agent-ws-ver"
    );
    const { investigationSchema } = await import(
      "../../../src/mastra/memory/investigation-schema"
    );
    const { getCodebaseAgentWorkspace } = await import(
      "../../../src/mastra/workspaces/codebase-workspace"
    );

    expect(mockConstructors.Agent).toHaveBeenCalledTimes(1);
    expect(codebaseAgent).toEqual({
      config: expect.objectContaining({
        id: "codebase-agent",
        name: "Codebase Agent",
        description:
          "Investigates the codebase by looking for bugs in relevant services and checking deployment history.",
        instructions: prompt,
        defaultOptions: {
          maxSteps: 12,
        },
        model: "openai/gpt-5.4",
        workspace: getCodebaseAgentWorkspace,
      }),
    });

    const agentConfig = mockConstructors.Agent.mock.calls[0][0];
    expect(agentConfig.memory).toEqual({
      config: {
        options: {
          lastMessages: 20,
          workingMemory: {
            enabled: true,
            scope: "thread",
            schema: investigationSchema,
          },
        },
      },
    });
    expect(agentConfig.inputProcessors).toEqual([
      {
        config: {
          filterAfterToolSteps: 8,
          preserveModelOutput: true,
        },
      },
    ]);
    expect(mockConstructors.ToolCallFilter).toHaveBeenCalledWith({
      filterAfterToolSteps: 8,
      preserveModelOutput: true,
    });
  });
});
