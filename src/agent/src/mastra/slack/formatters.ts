import type { Block, KnownBlock } from "@slack/web-api";
import type { IncidentReport } from "../types/report";
import type { AlertContext } from "../types/alert-context";

function toMrkdwn(markdown: string | undefined | null): string {
  if (!markdown) return "";

  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Placeholder prevents bold markers from being re-matched as italic in a second pass
  return escaped
    .replace(/\*\*(.*?)\*\*/g, "\u0001$1\u0001")
    .replace(/\*(.*?)\*/g, "_$1_")
    .replace(/\u0001(.*?)\u0001/g, "*$1*")
    .replace(/\[([^\]]+)\]\(((?:[^()]+|\([^()]*\))+)\)/g, "<$2|$1>");
}

export function buildSummaryBlocks(
  report: IncidentReport,
  resultUrl: string,
): (Block | KnownBlock)[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: report.title, emoji: false },
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: toMrkdwn(report.summary) },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🔍 Hypothesis*\n${toMrkdwn(report.hypothesis)}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📋 Next Steps*\n${toMrkdwn(report.nextSteps)}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${resultUrl}|View Result Query in Honeycomb>`,
      },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "👍", emoji: true },
          action_id: "positive_rating",
          value: report.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "👎", emoji: true },
          action_id: "negative_rating",
          value: report.id,
        },
      ],
    },
  ];
}

export function renderFullReportMarkdown(report: IncidentReport): string {
  return [
    `# ${report.title}`,
    `## Summary\n${report.summary}`,
    `## Alert Overview\n${report.alertOverview}`,
    `## Hypothesis\n${report.hypothesis}`,
    `## Findings\n${report.findings}`,
    `## Next Steps\n${report.nextSteps}`,
    `## Investigation Steps\n${report.investigationSteps}`,
  ].join("\n\n");
}

export function buildErrorBlocks(
  alertContext: AlertContext,
): (Block | KnownBlock)[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Incident Report Generation Failed",
        emoji: false,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Unfortunately, I was unable to generate an incident report for the following alert.",
      },
    },
    { type: "divider" },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Alert Trigger*\n${alertContext.triggerName}`,
        },
        { type: "mrkdwn", text: `*Environment*\n${alertContext.environment}` },
        {
          type: "mrkdwn",
          text: `*Alert Timestamp*\n${alertContext.alert.timestamp}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Alert Description*\n${alertContext.description}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${alertContext.resultUrl}|View Result Query in Honeycomb>`,
      },
    },
  ];
}
