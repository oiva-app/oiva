import type { Context } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { postRatingConfirmation } from "../slack/client";
import {
  slackRatingPayloadSchema,
  type SlackRatingPayload,
} from "../types/slack-rating";
import type { Block, KnownBlock } from "@slack/web-api";

function isVerifiedSlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const requestAge = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (requestAge > 300) return false;

  const signatureBase = `v0:${timestamp}:${rawBody}`;
  const expectedSignature = `v0=${createHmac("sha256", env.SLACK_SIGNING_SECRET).update(signatureBase).digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

async function handleRatingAction(payload: SlackRatingPayload): Promise<void> {
  const { actions, user, message } = payload;
  const actionId = actions[0].action_id;

  if (actionId !== "positive_rating" && actionId !== "negative_rating") {
    console.warn(`Unexpected action_id: ${actionId}`);
    return;
  }

  const rating = actionId === "positive_rating" ? "positive" : "negative";
  const reportId = actions[0].value;

  // TODO: save rating to DB by reportId
  console.log(`Report ${reportId} rated ${rating}ly by ${user.id}`);

  await postRatingConfirmation(
    message.ts,
    message.blocks as (Block | KnownBlock)[],
    rating,
    user.id,
  );
}

export async function slackRatingHandler(c: Context) {
  let rawBody: string;

  try {
    rawBody = await c.req.text();
  } catch {
    return c.json({ error: "invalid-body" }, 400);
  }

  const timestamp = c.req.header("x-slack-request-timestamp");
  const signature = c.req.header("x-slack-signature");

  if (
    !timestamp ||
    !signature ||
    !isVerifiedSlackSignature(rawBody, timestamp, signature)
  ) {
    return c.json({ error: "invalid-signature" }, 401);
  }

  const rawPayload = new URLSearchParams(rawBody).get("payload");
  if (!rawPayload) {
    return c.json({ error: "missing-payload" }, 400);
  }

  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(rawPayload);
  } catch {
    return c.json({ error: "invalid-payload" }, 400);
  }

  const parsedPayload = slackRatingPayloadSchema.safeParse(payloadJson);
  if (!parsedPayload.success) {
    return c.json({ error: "invalid-payload" }, 400);
  }

  await handleRatingAction(parsedPayload.data);
  return c.json({}, 200);
}
