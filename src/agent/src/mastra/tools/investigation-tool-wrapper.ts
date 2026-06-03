import { createTool, Tool } from "@mastra/core/tools";
import { SpanType } from "@mastra/core/observability";
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

/**
  Remember: the investigationTrace is NOT OTel instrumentation
 */
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
      
      /**
       * Create empty investigationTrace instead of failing
       */
      function getInvestigationTrace() {
        return telemetryTraceSchema.parse(
          context.requestContext?.get("investigationTrace") ?? [],
        );
      }

      function createOTelChildSpan() {
        return context.tracingContext?.currentSpan?.createChildSpan({
          type: SpanType.TOOL_CALL,
          name: `wrapped_tool ${tool.id}`,
          attributes: {
            toolDescription: tool.description,
          },
          input: toolInput,
          metadata: { toolId: tool.id, question },
        });
      }

      // Extract the wrapper-only field(s) before handing off to the real tool
      const { question, ...toolInput } = inputData as any;

      try {
        const investigationTrace = getInvestigationTrace()
        const span = createOTelChildSpan()

        try {
          const toolOutput = await tool.execute!(toolInput, context, ...rest);

          const toolTrace = telemetryToolCallSchema.parse({
            question,
            toolInput,
            toolOutput,
            error: false,
            // TODO after we get basic wrapper functionality working:
            // implement `url` capture functionality
          });

          investigationTrace.push(toolTrace);
          context.requestContext?.set("investigationTrace", investigationTrace);

          span?.end({ output: toolOutput, attributes: { success: true } });  // TODO - include toolTrace in telemetry

          return toolOutput;
        } catch (e) {
          span?.error({
            error: e instanceof Error ? e : new Error(String(e)),
            attributes: { success: false },
          });
          throw e;
        }
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
