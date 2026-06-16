import { WebClient, Block, KnownBlock, ActionsBlock } from "@slack/web-api";
import { env } from "../config/env";
import {
  buildReportBlocks,
  renderFullReportMarkdown,
  buildErrorBlocks,
  buildRatingConfirmationBlock,
} from "./formatters";
import type { IncidentReport } from "@/domain/incident-report";
import type { AlertContext } from "@/domain/alert-context";
import type { SlackThreadData } from "@/api/slack-payload";
import { fiveRetriesInFiveMinutes } from "@slack/web-api/dist/retry-policies.js";

const client = new WebClient(env.SLACK_BOT_TOKEN, {
  retryConfig: fiveRetriesInFiveMinutes,
});

export async function postReportSummary(
  report: IncidentReport,
): Promise<SlackThreadData> {
  const blocks = buildReportBlocks(report);

  const result = await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    blocks,
    text: "Oiva Incident Report",
  });

  if (!result.ts) {
    throw new Error("Slack API did not return a message timestamp.");
  }

  if (!result.channel) {
    throw new Error("Slack API did not return a channel.");
  }

  return { ts: result.ts, channel: result.channel };
}

export async function postIncidentRoot(input: {
  blocks: (Block | KnownBlock)[];
  fallbackText: string;
}): Promise<SlackThreadData> {
  const result = await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    blocks: input.blocks,
    text: input.fallbackText,
  });

  if (!result.ts) {
    throw new Error("Slack API did not return a message timestamp.");
  }
  if (!result.channel) {
    throw new Error("Slack API did not return a channel.");
  }

  return { ts: result.ts, channel: result.channel };
}

export async function updateIncidentMessage(input: {
  channel: string;
  ts: string;
  blocks: (Block | KnownBlock)[];
  fallbackText: string;
}): Promise<void> {
  await client.chat.update({
    channel: input.channel,
    ts: input.ts,
    blocks: input.blocks,
    text: input.fallbackText,
  });
}

export async function postThreadReply(input: {
  channel: string;
  threadTs: string;
  blocks: (Block | KnownBlock)[];
  fallbackText: string;
}): Promise<void> {
  await client.chat.postMessage({
    channel: input.channel,
    thread_ts: input.threadTs,
    blocks: input.blocks,
    text: input.fallbackText,
  });
}

/**
 * Posts a message only the given user sees (in-thread when threadTs is set).
 * Used for transient close-failure feedback — no history, no notification.
 */
export async function postEphemeralError(input: {
  channel: string;
  user: string;
  threadTs?: string;
  text: string;
}): Promise<void> {
  await client.chat.postEphemeral({
    channel: input.channel,
    user: input.user,
    thread_ts: input.threadTs,
    text: input.text,
  });
}

export async function uploadFileToThread(
  threadTs: string,
  report: IncidentReport,
): Promise<void> {
  const content = renderFullReportMarkdown(report);

  await client.filesUploadV2({
    channel_id: env.SLACK_CHANNEL_ID,
    thread_ts: threadTs,
    content,
    filename: `oiva-incident-report-${report.id}.md`,
    title: report.title,
  });
}

const RATING_ACTION_IDS = ["positive_rating", "negative_rating"];

function isRatingActionsBlock(block: Block | KnownBlock): boolean {
  if (block.type !== "actions") return false;

  const actionsBlock = block as ActionsBlock;
  for (const el of actionsBlock.elements) {
    const actionId = "action_id" in el ? el.action_id : undefined;
    if (actionId !== undefined && RATING_ACTION_IDS.includes(actionId)) {
      return true;
    }
  }
  return false;
}

export async function postRatingConfirmation(
  messageTs: string,
  channelId: string,
  originalBlocks: (Block | KnownBlock)[],
  rating: "positive" | "negative",
  userId: string,
): Promise<void> {
  const updatedBlocks = originalBlocks.filter(
    (block) => !isRatingActionsBlock(block),
  );
  const userRatedBlock = buildRatingConfirmationBlock(rating, userId);

  updatedBlocks.push(userRatedBlock);

  await client.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks: updatedBlocks,
  });
}

export async function postErrorMessage(
  alertContext: AlertContext,
): Promise<void> {
  const blocks = buildErrorBlocks(alertContext);

  await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    blocks,
    text: "Oiva Incident Report Generation Failed",
  });
}

export async function postErrorToThread(threadTs: string): Promise<void> {
  await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    thread_ts: threadTs,
    text: "Unfortunately, I was unable to attach the full incident report. See the summary above to view the key insights.",
  });
}
