import { createTool, Tool } from "@mastra/core/tools";
import { standardSchemaToJSONSchema } from "@mastra/schema-compat/schema";
import type { JSONSchema7 } from "json-schema";

import {
  telemetryToolCallSchema,
  telemetryTraceSchema,
} from "@/types/investigation";

const questionProperty = {
  type: "string",
  description:
    "Why are you using the tool? Example: `What errors exist in the 'product_catalog' dataset?`",
} as const;

export function investigationToolWrapper<T extends Record<string, any>, K>(
  tool: Tool<T, K>,
) {
  const baseJson: JSONSchema7 = tool.inputSchema
    ? (standardSchemaToJSONSchema(tool.inputSchema) as JSONSchema7)
    : { type: "object", properties: {} };

  const inputSchema: JSONSchema7 = {
    ...baseJson,
    type: "object",
    properties: { ...baseJson.properties, question: questionProperty },
    required: [...(baseJson.required ?? []), "question"],
  };

  return createTool({
    id: tool.id,
    description: tool.description,
    outputSchema: tool.outputSchema,
    inputSchema,
    execute: async (inputData, context, ...rest) => {
      
      // Extract the wrapper-only field before handing off to the real tool
      const { question, ...toolInput } = inputData as any;

      try {
        const investigationTrace = telemetryTraceSchema.parse(
          // Create empty context instead of failing
          context.requestContext?.get("investigationTrace") ?? [],
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
