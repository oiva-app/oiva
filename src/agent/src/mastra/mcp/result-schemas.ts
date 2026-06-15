import { z } from "zod";

/**
 * MCP CallToolResult schema.
 *
 * As defined by MCP spec:
 * https://modelcontextprotocol.io/specification/2025-11-25/server/tools

   Why aren't we using schemas/types from @modelcontextprotocol/sdk/types.js ?
     1) TBD if their zod version is compatible with ours
     2) Not really sure?  Could be good to switch to the SDK types
 */
export const CallToolResultSchema = z.object({
  type: z.literal("resource_link"),
  text: z.string().optional(),
  uri: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
});
export type McpResourceLink = z.infer<typeof CallToolResultSchema>;

export const TextContentSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type McpTextContent = z.infer<typeof TextContentSchema>;

export const ContentBlockSchema = z.union([
  TextContentSchema,
  CallToolResultSchema,
  z.object({ type: z.string() }).loose(),
]);

export const ResourceLinkSchema = z
  .object({
    content: z.array(ContentBlockSchema),
    isError: z.boolean().optional(),
  })
  .loose();
