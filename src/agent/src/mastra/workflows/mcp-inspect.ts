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
        result.push(tools[toolName])
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