import { createTool, Tool } from "@mastra/core/tools";
import { SpanType } from "@mastra/core/observability";
import {
  standardSchemaToJSONSchema,
  type StandardSchemaWithJSON,
} from "@mastra/schema-compat/schema";
import type { JSONSchema7 } from "json-schema";

import {
  telemetryToolCallSchema,
  telemetryTraceSchema,
} from "@/types/investigation";
import { ResourceLinkSchema, type McpTextContent } from "@/types/mcp";


function extractQueryUrl(toolOutput: unknown): string {
  const parsed = ResourceLinkSchema.safeParse(toolOutput);
  if (!parsed.success) return "";

  const textBlock = parsed.data.content.find(
    (c): c is McpTextContent => c.type === "text",
  );
  // Metadata section has a line: query_url: "https://ui.honeycomb.io/.../result/..."
  const match = textBlock?.text.match(/query_url:.+?"(.+?)"/);
  return match?.[1] ?? "";
}


///////////////////////////////////////////////////////////////////////////////
// Additional properties to be added to the wrapped tool

const questionProperty = {
  type: "string",
  description:
    "Why are you using the tool? Example: `What errors exist in the 'product_catalog' dataset?`  Limit to 65 characters, if possible.",
} as const;

/*
Todo: refactor to make function pure, remove closure, and accept multiple properties (not just one)
*/
function wrapInputSchema(
  inputSchema: StandardSchemaWithJSON | undefined,
): JSONSchema7 {
  const baseJson: JSONSchema7 = inputSchema
    ? (standardSchemaToJSONSchema(inputSchema) as JSONSchema7)
    : { type: "object", properties: {} };

  return {
    ...baseJson,
    type: "object",
    properties: { ...baseJson.properties, question: questionProperty },
    required: [...(baseJson.required ?? []), "question"],
  };
}
///////////////////////////////////////////////////////////////////////////////

/**
  Remember: the investigationTrace is NOT OTel instrumentation
 */
export function investigationToolWrapper<T extends Record<string, any>, K>(
  tool: Tool<T, K>,
) {
  const inputSchema: JSONSchema7 = wrapInputSchema(tool.inputSchema);

  return createTool({
    id: tool.id,
    description: tool.description,
    outputSchema: tool.outputSchema,
    inputSchema,
    execute: async (inputData, context, ...rest) => {
      function getInvestigationTrace() {
        return telemetryTraceSchema.parse(
          // Create empty investigationTrace instead of failing
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
        const investigationTrace = getInvestigationTrace();

        const span = createOTelChildSpan();

        // Why a nested try-catch block?
        // To annotate tool call errors on the *child* OTel span
        try {
          const toolOutput = await tool.execute!(toolInput, context, ...rest);

          const toolTrace = telemetryToolCallSchema.parse({
            question,
            toolInput,
            toolOutput,
            error: false,
            queryUrl: extractQueryUrl(toolOutput),
          });

          investigationTrace.push(toolTrace);
          context.requestContext?.set("investigationTrace", investigationTrace);

          // end child span and annotate parent span
          span?.end({ output: toolOutput, attributes: { success: true } });
          context.tracingContext?.currentSpan?.update({
            metadata: {
              "app.toolTrace": JSON.stringify(toolTrace),
              "app.investigationTrace": JSON.stringify(
                context.requestContext?.get("investigationTrace"),
              ),
            },
          });

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
