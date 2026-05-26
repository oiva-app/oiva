import { createWorkflow, createStep } from "@mastra/core/workflows";
import { mvpMcpClient } from "../mcp/mcpClients";
import z from "zod";

const inputSchema = z.object({
    find: z.string().default("").describe("Use an empty string in order to return ALL tools")
  })

const outputSchema = z.array(z.any())

const listToolsStep = createStep({
  id: "listTools",
  description:
    "List tools that contain the string",
  inputSchema,
  outputSchema,
  execute: async ({ inputData }) => {
    const result = []

    const tools = await mvpMcpClient.listTools();
    for (let toolName of Object.keys(tools)) {
      if (toolName.includes(inputData.find)) {
        const tool = tools[toolName];
        // tool.inputSchema is a Standard Schema wrapper whose `jsonSchema`
        // properties are functions — they don't survive JSON.stringify, which
        // is why the raw schema looks empty. Invoke them to capture the schema.
        const std = (tool.inputSchema as any)?.["~standard"];
        const inputJsonSchema = std?.jsonSchema?.input?.({ target: "draft-07" });

        result.push({
          id: tool.id,
          description: tool.description,
          inputSchema: inputJsonSchema,
          requireApproval: (tool as any).requireApproval,
          mcpMetadata: (tool as any).mcpMetadata,
        })
      }
    }
    return result
  },
});

export const inspectMcpWorkflow = createWorkflow({
  id: "inspect-mcp",
  inputSchema,
  outputSchema,
})
  .then(listToolsStep)
  .commit();