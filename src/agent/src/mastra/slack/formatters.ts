import type { Block, KnownBlock } from "@slack/web-api";
import type { IncidentReport } from "../types/report";
import type { AlertContext } from "../types/alert-context";
import type { ActivityLogEntry, IncidentRenderInputs } from "./render-types";
import type { ClosedBy } from "../ports/progress-reporter";
import type { IncidentStatus } from "../ports/incident-repository";
import type { InvestigationStep } from "../types/investigation";
import { formatDuration } from "../domain/incident-duration";

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
    ...(report.durationMs != null
      ? [
          {
            type: "context" as const,
            elements: [
              {
                type: "mrkdwn" as const,
                text: `⏱️ Time to report: ${formatDuration(report.durationMs)}`,
              },
            ],
          },
        ]
      : []),
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

export function formatInvestigationSteps(
  trace: readonly InvestigationStep[],
): string {
  if (trace.length === 0) {
    return "Hmm, something went wrong, nothing to see here.";
  }

  return trace
    .map((step, index) => {
      const heading = `**${index + 1}. ${step.toolUseIntent || step.toolName}**`;

      let toolLine: string;
      if (step.error) {
        toolLine = "(invalid tool call)";
      } else if (step.queryUrl) {
        toolLine = `Tool use: [${step.toolName}](${step.queryUrl})`;
      } else {
        toolLine = `Tool use: ${step.toolName}`;
      }

      return `${heading}\n${toolLine}`;
    })
    .join("\n\n");
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
          text: `*Alert Trigger*\n${truncateForHeader(alertContext.triggerName)}`,
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

export function buildRatingConfirmationBlock(
  rating: "positive" | "negative",
  userId: string,
): Block | KnownBlock {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Rated ${rating === "positive" ? "👍" : "👎"} by <@${userId}>`,
      },
    ],
  };
}

const PHASE_LABELS: Record<IncidentStatus, string> = {
  triggered: "Investigation in progress",
  investigating: "Investigation in progress",
  report_in_process: "Writing report",
  report_generated: "Report ready",
  report_delivered: "Report ready",
  failed: "Investigation failed",
  closed: "Closed",
};

const PHASE_GLYPHS: Partial<Record<IncidentStatus, string>> = {
  failed: "⚠️ ",
};

const HEADER_TEXT_LIMIT = 150;

function truncateForHeader(text: string): string {
  if (text.length <= HEADER_TEXT_LIMIT) return text;
  return text.slice(0, HEADER_TEXT_LIMIT - 1) + "…";
}

export function buildIncidentPhaseBlock(
  incidentId: string,
  status: IncidentStatus,
): KnownBlock {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${PHASE_GLYPHS[status] ?? ""}Incident* \`${incidentId}\` — *${PHASE_LABELS[status]}*`,
    },
  };
}

export function buildIncidentHeaderBlocks(
  alert: AlertContext,
): (Block | KnownBlock)[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: truncateForHeader(alert.triggerName),
        emoji: false,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: toMrkdwn(alert.description) },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Environment*: ${alert.environment}  ·  *Triggered at*: ${alert.alert.timestamp}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${alert.resultUrl}|View Result Query in Honeycomb>`,
      },
    },
  ];
}

const TASK_PHRASING: Record<string, { present: string; past: string }> = {
  "telemetry-agent": {
    present: "Investigating telemetry",
    past: "Investigated telemetry",
  },
  "codebase-agent": {
    present: "Examining codebase",
    past: "Examined codebase",
  },
  report: { present: "Writing report", past: "Report written" },
};

function phrasingFor(taskKey: string): { present: string; past: string } {
  return TASK_PHRASING[taskKey] ?? { present: taskKey, past: taskKey };
}

/**
 * `interrupted` is set once the incident reaches a terminal state (failed or
 * closed): any still-pending task never finished, so it's rendered as a failed
 * line rather than a live spinner.
 */
function renderActivityLine(
  entry: ActivityLogEntry,
  interrupted: boolean,
): string {
  switch (entry.kind) {
    case "milestone":
      return `✅ ${entry.label}`;
    case "delegationPending":
      return interrupted
        ? `❌ ${phrasingFor(entry.taskKey).present} - interrupted`
        : `🔄 ${phrasingFor(entry.taskKey).present}…`;
    case "delegationCompleted": {
      const icon = entry.success ? "✅" : "❌";
      const dur = formatDuration(entry.durationMs);
      const finding = entry.headline ? ` - ${toMrkdwn(entry.headline)}` : "";
      return `${icon} ${phrasingFor(entry.taskKey).past}${finding} - ${dur}`;
    }
  }
}

export function buildActivityLogBlock(
  entries: ReadonlyArray<ActivityLogEntry>,
  interrupted = false,
): KnownBlock | null {
  if (entries.length === 0) return null;
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: entries.map((e) => renderActivityLine(e, interrupted)).join("\n"),
    },
  };
}

export function buildAttachCounterBlock(count: number): KnownBlock | null {
  if (count <= 0) return null;
  const label = count === 1 ? "related alert" : "related alerts";
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text: `↻ ${count} ${label}` }],
  };
}

export function buildIncidentFailedBlocks(
  reason: string,
  incidentId: string,
): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Investigation failed*\n${toMrkdwn(reason)}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Retry", emoji: false },
          action_id: "incident_retry",
          value: incidentId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Close", emoji: false },
          action_id: "incident_close",
          style: "danger",
          value: incidentId,
        },
      ],
    },
  ];
}

export function buildIncidentClosedAttributionBlock(by: ClosedBy): KnownBlock {
  const text =
    by.kind === "user"
      ? `🔒 Closed by <@${by.userId}>`
      : "🔒 Auto-closed (no activity)";
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  };
}

export function buildIncidentMessageBlocks(
  inputs: IncidentRenderInputs,
  incidentId: string,
): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
    buildIncidentPhaseBlock(incidentId, inputs.status),
  ];

  const activity = buildActivityLogBlock(inputs.log, inputs.failure != null);
  if (activity) blocks.push(activity);

  blocks.push({ type: "divider" });

  if (inputs.report) {
    blocks.push(
      ...buildSummaryBlocks(inputs.report.report, inputs.report.resultUrl),
    );
  } else {
    blocks.push(...buildIncidentHeaderBlocks(inputs.alert));
  }

  const counter = buildAttachCounterBlock(inputs.attachCount);
  if (counter) blocks.push(counter);

  if (inputs.failure) {
    blocks.push(
      { type: "divider" },
      ...buildIncidentFailedBlocks(inputs.failure.reason, incidentId),
    );
  }

  return blocks;
}
