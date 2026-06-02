import { createTool, Tool } from "@mastra/core/tools";
import { z } from "zod";

import { telemetryTraceSchema } from "@/types/investigation";

// The agent-only field you want every wrapped tool to expose
const questionField = {
  question: z
    .string()
    .describe(
      "Why are you using the tool? Example: `What errors exist in the 'product_catalog' dataset?`",
    ),
};

export function withQuestion<T extends ReturnType<typeof createTool>>(tool: T) {
  
  const baseSchema = tool.inputSchema as z.ZodObject<any>;

  return createTool({
    id: tool.id,
    description: tool.description,
    outputSchema: tool.outputSchema,
    inputSchema: baseSchema.extend(questionField), // what the agent sees
    execute: async (inputData, context, ...rest) => {
      // Drop the agent-only field before handing off to the real tool
      const { question, ...toolInput } = inputData as any;
      const investigationTrace = telemetryTraceSchema.parse(
        context.requestContext?.get("investigationTrace"),
      );

      try {
        if (!investigationTrace) throw new Error("Missing investigationTrace");
        const result = await tool.execute!(toolInput, context, ...rest);
        return result
      } catch (e) {
        context.tracingContext?.currentSpan?.update({
          metadata: {
            error: true,
            "app.error": e instanceof Error ? e.message : String(e),
          },
        });
      }
    },
  });
}
