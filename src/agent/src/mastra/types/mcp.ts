import { z } from "zod";

/**
 * MCP CallToolResult schema.
 *
 * As defined by MCP spec:
 * https://modelcontextprotocol.io/specification/2025-11-25/server/tools
 */
export const mcpResourceLinkSchema = z.object({
  type: z.literal("resource_link"),
  uri: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
});
export type McpResourceLink = z.infer<typeof mcpResourceLinkSchema>;

export const mcpContentBlockSchema = z.union([
  mcpResourceLinkSchema,
  z.object({ type: z.string() }).loose(),
]);

export const mcpToolResultSchema = z
  .object({
    content: z.array(mcpContentBlockSchema),
    isError: z.boolean().optional(),
  })
  .loose();
