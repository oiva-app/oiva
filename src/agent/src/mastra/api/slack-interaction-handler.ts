import type { Context } from "hono";
import type { Mastra } from "@mastra/core/mastra";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env";
import { postRatingConfirmation } from "@/slack/client";
import {
  handleIncidentClose,
  handleIncidentRetry,
} from "./incident-action-handler";
import {
  slackInteractionPayloadSchema,
  type SlackInteractionPayload,
} from "./slack-payload";
import type { Block, KnownBlock } from "@slack/web-api";
import { reportRepository } from "@/repositories";

function isVerifiedSlackSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const requestAge = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isNaN(requestAge) || requestAge > 300) return false;

  const signatureBase = `v0:${timestamp}:${rawBody}`;
  const expectedSignature = `v0=${createHmac("sha256", env.SLACK_SIGNING_SECRET).update(signatureBase).digest("hex")}`;

  const expectedBuffer = Buffer.from(expectedSignature);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function handleRatingAction(
  payload: SlackInteractionPayload,
): Promise<void> {
  const { actions, user, message, channel } = payload;
  const actionId = actions[0].action_id;

  const rating = actionId === "positive_rating" ? "positive" : "negative";
  const reportId = actions[0].value;

  try {
    await reportRepository.recordFeedback(reportId, rating);
  } catch (err) {
    console.error("recordFeedback failed", {
      reportId,
      userId: user.id,
      rating,
      err,
    });
    return;
  }

  await postRatingConfirmation(
    message.ts,
    channel.id,
    message.blocks as (Block | KnownBlock)[],
    rating,
    user.id,
  );
}

export async function slackInteractionHandler(c: Context) {
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

  const parsedPayload = slackInteractionPayloadSchema.safeParse(payloadJson);
  if (!parsedPayload.success) {
    return c.json({ error: "invalid-payload" }, 400);
  }
  // Ack within 3s; run the action in the background (best-effort, logs its own errors).
  const mastra = c.get("mastra") as Mastra;
  void dispatchAction(parsedPayload.data, mastra).catch((err) =>
    console.error("slackInteractionHandler: action failed", {
      actionId: parsedPayload.data.actions[0].action_id,
      err,
    }),
  );

  // await handleRatingAction(parsedPayload.data);
  return c.json({}, 200);
}

async function dispatchAction(
  payload: SlackInteractionPayload,
  mastra: Mastra,
): Promise<void> {
  const { action_id, value } = payload.actions[0];
  switch (action_id) {
    case "positive_rating":
    case "negative_rating":
      return handleRatingAction(payload);
    case "incident_close":
      return handleIncidentClose(
        value,
        payload.user.id,
        payload.channel.id,
        payload.message.ts,
      );
    case "incident_retry":
      return handleIncidentRetry(value, mastra);
    default:
      console.warn("slackInteractionHandler: unhandled action_id", {
        action_id,
      });
  }
}
