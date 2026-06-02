import { createTool, Tool } from "@mastra/core/tools";
import { z } from "zod";

import {
  telemetryToolCallSchema,
  telemetryTraceSchema,
} from "@/types/investigation";

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
    inputSchema: baseSchema.extend(questionField),
    execute: async (inputData, context, ...rest) => {
      
      // Extract the wrapper-only field before handing off to the real tool
      const { question, ...toolInput } = inputData as any;

      try {
        const investigationTrace = telemetryTraceSchema.parse(
          context.requestContext?.get("investigationTrace"),
        );

        const toolOutput = await tool.execute!(toolInput, context, ...rest);

        const toolTrace = telemetryToolCallSchema.parse({
          question,
          toolInput,
          toolOutput,
          error: false,
        });

        investigationTrace.push(toolTrace);
        context.requestContext?.set("investigationTrace", investigationTrace);

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
