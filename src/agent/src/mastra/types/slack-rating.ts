import { z } from "zod";

export const slackRatingPayloadSchema = z.object({
  type: z.literal("block_actions"),
  user: z.object({
    id: z.string(),
  }),
  message: z.object({
    ts: z.string(),
    blocks: z.array(z.unknown()),
  }),
  actions: z
    .array(
      z.object({
        action_id: z.enum(["positive_rating", "negative_rating"]),
        value: z.string(),
      }),
    )
    .min(1),
});

export type SlackRatingPayload = z.infer<typeof slackRatingPayloadSchema>;
