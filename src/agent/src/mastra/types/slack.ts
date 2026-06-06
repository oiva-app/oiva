import { z } from "zod";

export const slackInteractionPayloadSchema = z.object({
  type: z.literal("block_actions"),
  user: z.object({
    id: z.string(),
  }),
  message: z.object({
    ts: z.string(),
    blocks: z.array(z.unknown()),
  }),
  channel: z.object({
    id: z.string(),
  }),
  actions: z
    .array(
      z.object({
        action_id: z.string(),
        value: z.string(),
      }),
    )
    .min(1),
});

export type SlackInteractionPayload = z.infer<
  typeof slackInteractionPayloadSchema
>;

export const slackThreadDataSchema = z.object({
  ts: z.string(),
  channel: z.string(),
});

export type SlackThreadData = z.infer<typeof slackThreadDataSchema>;
