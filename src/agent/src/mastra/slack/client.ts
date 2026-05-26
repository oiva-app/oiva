import { WebClient } from "@slack/web-api";
import type { Block, KnownBlock } from "@slack/web-api";
import { env } from "../config/env";

const client = new WebClient(env.SLACK_BOT_TOKEN);

export async function postBlockKitMessage(
  channel: string,
  blocks: (Block | KnownBlock)[],
  fallbackText: string,
): Promise<string> {
  const result = await client.chat.postMessage({
    channel,
    blocks,
    text: fallbackText,
  });

  return result.ts!;
}

export async function uploadFileToThread(
  channel: string,
  threadTs: string,
  content: string,
  filename: string,
): Promise<void> {
  await client.filesUploadV2({
    channel_id: channel,
    thread_ts: threadTs,
    content,
    filename,
    title: filename,
  });
}

export async function updateMessage(
  channel: string,
  ts: string,
  blocks: (Block | KnownBlock)[],
  fallbackText: string,
): Promise<void> {
  await client.chat.update({
    channel,
    ts,
    blocks,
    text: fallbackText,
  });
}

export async function postErrorMessage(
  channel: string,
  blocks: (Block | KnownBlock)[],
  fallbackText: string,
): Promise<void> {
  await client.chat.postMessage({
    channel,
    blocks,
    text: fallbackText,
  });
}
