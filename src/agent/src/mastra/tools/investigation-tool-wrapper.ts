import { logger } from "@/observability/logging";
import { createTool, Tool } from "@mastra/core/tools";
import { SpanType } from "@mastra/core/observability";
import {
  standardSchemaToJSONSchema,
  type StandardSchemaWithJSON,
} from "@mastra/schema-compat/schema";
import type { JSONSchema7 } from "json-schema";

import {
  investigationToolCallSchema,
  investigationTraceSchema,
} from "@/domain/investigation";
import { ResourceLinkSchema, type McpTextContent } from "@/mcp/result-schemas";

const DEFAULT_PROMPT =
  "Why are you using the tool? Example: `What errors exist in the 'product_catalog' dataset?`  Limit to 65 characters, if possible.";

function extractQueryUrl(toolOutput: unknown): string {
  const parsed = ResourceLinkSchema.safeParse(toolOutput);
  if (!parsed.success) return "";

  const textBlock = parsed.data.content.find(
    (c): c is McpTextContent => c.type === "text",
  );
  const text = textBlock?.text;
  if (!text) return "";

  // Regex must be careful to avoid selecting an adjacent URL, e.g.
  // '... query_url: null  evil_url: "http://don't select me by accident.com"...'
  const queryUrl = text.match(/query_url:\s*\\*"(.+?)\\*"/);
  const traceUrl = text.match(/trace_link:\s*\\*"(.+?)\\*"/);
  const resultUrl = text.match(/result_url:\s*\\*"(.+?)\\*"/);
  const bubbleupUrl = text.match(/bubble_up_url:\s*\\*"(.+?)\\*"/);
  return (
    queryUrl?.[1] || traceUrl?.[1] || resultUrl?.[1] || bubbleupUrl?.[1] || ""
  );
}

/**
  Returns a 'wrapped' MCP tool in order to add the 
  tool-use intent to the investigationTrace

  Remember: the investigationTrace is NOT OTel instrumentation!
  @param tool the tool you wish to wrap
  @param toolUseIntent LLM prompt used to generate the toolUseIntent description
 */
export function investigationToolWrapper<T extends Record<string, any>, K>(
  tool: Tool<T, K>,
  toolUseIntent: string = DEFAULT_PROMPT,
) {
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
      properties: {
        ...baseJson.properties,
        toolUseIntent: {
          type: "string",
          description: toolUseIntent,
        },
      },
      required: [...(baseJson.required ?? []), "toolUseIntent"],
    };
  }

  const inputSchema: JSONSchema7 = wrapInputSchema(tool.inputSchema);

  return createTool({
    id: tool.id,
    description: tool.description,
    outputSchema: tool.outputSchema,
    inputSchema,
    execute: async (inputData, context, ...rest) => {
      function getInvestigationTrace() {
        return investigationTraceSchema.parse(
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
          metadata: { toolId: tool.id, toolUseIntent },
        });
      }

      // Extract the wrapper-only field(s) before handing off to the real tool
      const { toolUseIntent, ...toolInput } = inputData as any;

      try {
        const investigationTrace = getInvestigationTrace();

        const span = createOTelChildSpan();

        // Why a nested try-catch block?
        // To annotate MCP tool call errors on the *child OTel span*
        try {
          const toolOutput = await tool.execute!(toolInput, context, ...rest);

          const toolTrace = investigationToolCallSchema.parse({
            toolName: tool.id,
            toolUseIntent,
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
export function wrapTools(
  tools: Record<string, Tool<any, any> | undefined>,
  toolUseIntent: string = DEFAULT_PROMPT,
) {
  const wrappedTools: Record<
    string,
    ReturnType<typeof investigationToolWrapper>
  > = {};
  for (const [key, tool] of Object.entries(tools)) {
    if (!tool) {
      logger.warn(
        `[wrapTools] skipping wrap: "${key}" not provided by the tool source`,
      );
      continue;
    }
    wrappedTools[key] = investigationToolWrapper(tool, toolUseIntent);
  }
  return wrappedTools;
}
