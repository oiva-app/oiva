import { createTool, Tool } from "@mastra/core/tools";
import { z } from "zod";

import {
  telemetryToolCallSchema,
  telemetryTraceSchema,
} from "@/types/investigation";
import { honeycomb_get_dataset } from "@/mcp/mcpClients";

// The agent-only field you want every wrapped tool to expose
const questionField = {
  question: z
    .string()
    .describe(
      "Why are you using the tool? Example: `What errors exist in the 'product_catalog' dataset?`",
    ),
};

export function investigationToolWrapper<T extends Record<string, any>, K>(
  tool: Tool<T, K>,
) {
  const baseSchema = tool.inputSchema as z.ZodObject<any>;

  return createTool({
    id: tool.id,
    description: tool.description,
    outputSchema: tool.outputSchema,
    inputSchema: baseSchema.extend(questionField), // what the agent sees
    execute: async (inputData, context, ...rest) => {
      // Drop the wrapper-only field before handing off to the real tool
      const { question, ...toolInput } = inputData as any;

      const investigationTrace = telemetryTraceSchema.parse(
        context.requestContext?.get("investigationTrace")
      );

      try {
        if (!investigationTrace) throw new Error("Missing investigationTrace");
        const toolOutput = await tool.execute!(toolInput, context, ...rest);

        const toolTrace = telemetryToolCallSchema.parse({
          question,
          toolInput,
          toolOutput,
          query_url: "PLACEHOLDER 🔴",
          error: null, // or null if unknown
        });

        investigationTrace.push(toolTrace);

        return toolOutput;
      } catch (e) {
        context.tracingContext?.currentSpan?.update({
          metadata: {
            error: true,
            "app.error": e instanceof Error ? e.message : String(e),
          },
        });
        throw e;
      }
    },
  });
}

// JUST FOR TESTING, REMOVE WHEN DONE
const wrapped_get_dataset = investigationToolWrapper(honeycomb_get_dataset);
