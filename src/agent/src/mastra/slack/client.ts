import { WebClient } from "@slack/web-api";
import { env } from "../config/env";
import {
  buildSummaryBlocks,
  renderFullReportMarkdown,
  buildErrorBlocks,
} from "./formatters";
import type { IncidentReport } from "../types/report";
import type { AlertContext } from "../types/alert-context";

const client = new WebClient(env.SLACK_BOT_TOKEN);

export async function postReportSummary(
  report: IncidentReport,
  resultUrl: string,
): Promise<string> {
  const blocks = buildSummaryBlocks(report, resultUrl);

  const result = await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    blocks,
    text: "Oiva Incident Report",
  });

  if (!result.ts) {
    throw new Error("Slack API did not return a message timestamp.");
  }

  return result.ts;
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

export async function postRatingConfirmation(
  threadTs: string,
  rating: "positive" | "negative",
  userName: string,
): Promise<void> {
  const emoji = rating === "positive" ? "👍" : "👎";

  await client.chat.postMessage({
    channel: env.SLACK_CHANNEL_ID,
    thread_ts: threadTs,
    text: `The report has been rated ${emoji} by @${userName}`,
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
    text: "Unfortunately, I was unable to attach the full report. See the summary above to view key insights.",
  });
}
