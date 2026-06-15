import type {
  Block,
  KnownBlock,
  RichTextBlock,
  RichTextSection,
} from "@slack/web-api";
import type { IncidentReport, Hypothesis } from "../types/report";
import type { AlertContext } from "../types/alert-context";
import type { ActivityLogEntry, IncidentRenderInputs } from "./render-types";
import type { ClosedBy } from "../ports/progress-reporter";
import type { IncidentStatus } from "../ports/incident-repository";
import type { InvestigationStep, NextStep } from "../types/investigation";
import { formatDuration } from "../domain/incident-duration";

const NEXT_STEP_GROUPS = [
  { key: "immediate", label: "Immediate" },
  { key: "short_term", label: "Short-term" },
  { key: "follow_up", label: "Follow-up" },
] as const;

function textEl(text: string, bold = false) {
  return bold
    ? ({ type: "text", text, style: { bold: true } } as const)
    : ({ type: "text", text } as const);
}

type RichInlineText = {
  type: "text";
  text: string;
  style?: { bold?: boolean; code?: boolean };
};

/**
 * Splits a string into rich_text elements, rendering `backtick` spans as inline
 * code. `bold` applies to the non-code text (code spans stay code-styled).
 *
 * The split regex with a capturing group: split() keeps the
 * delimiters, yielding alternating plain-text and code chunks (plus the empty
 * strings filtered out below). Unbalanced/empty backticks simply fall through as
 * literal text.
 */
function inlineElements(text: string, bold = false): RichInlineText[] {
  const parts = text.split(/(`[^`]+`)/g).filter((p) => p !== "");
  if (parts.length === 0) return [{ type: "text", text }];

  return parts.map((part) => {
    const isCode =
      part.length >= 2 && part.startsWith("`") && part.endsWith("`");
    const content = isCode ? part.slice(1, -1) : part;
    const style: RichInlineText["style"] = {};
    if (bold) style.bold = true;
    if (isCode) style.code = true;
    return Object.keys(style).length > 0
      ? { type: "text", text: content, style }
      : { type: "text", text: content };
  });
}

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

export function buildNextStepsBlock(
  steps: readonly NextStep[],
): RichTextBlock | null {
  if (steps.length === 0) return null;

  const elements: RichTextBlock["elements"] = [
    { type: "rich_text_section", elements: [textEl("📋 Next Steps", true)] },
  ];

  let firstGroup = true;
  for (const { key, label } of NEXT_STEP_GROUPS) {
    const group = steps.filter((s) => s.priority === key);
    if (group.length === 0) continue;

    // Blank line before each group heading (after the first) for breathing room.
    if (!firstGroup) {
      elements.push({ type: "rich_text_section", elements: [textEl("\n")] });
    }
    firstGroup = false;

    elements.push({
      type: "rich_text_section",
      elements: [textEl(label, true)],
    });
    elements.push({
      type: "rich_text_list",
      style: "bullet",
      elements: group.map((s) => ({
        type: "rich_text_section" as const,
        elements: [
          ...inlineElements(s.action, true),
          ...inlineElements(` ${s.rationale}`),
        ],
      })),
    });
  }

  return { type: "rich_text", elements };
}

export function buildInvestigationStepsBlock(
  steps: readonly InvestigationStep[],
): RichTextBlock | null {
  if (steps.length === 0) return null;

  const items = steps.map((step) => {
    const elements: RichTextSection["elements"] = [
      textEl(step.toolUseIntent || step.toolName, true),
    ];
    if (step.error) {
      elements.push(textEl("\n(invalid tool call)"));
    } else if (step.queryUrl) {
      elements.push(textEl("\nTool use: "));
      elements.push({ type: "link", url: step.queryUrl, text: step.toolName });
    } else {
      elements.push(textEl(`\nTool use: ${step.toolName}`));
    }
    return { type: "rich_text_section" as const, elements };
  });

  return {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [textEl("🐾 Investigation Steps", true)],
      },
      { type: "rich_text_list", style: "ordered", elements: items },
    ],
  };
}

export function buildHypothesisEvidenceBlock(
  hypothesis: Hypothesis,
): RichTextBlock | null {
  const { evidenceFor, evidenceAgainst } = hypothesis;
  if (evidenceFor.length === 0 && evidenceAgainst.length === 0) return null;

  const elements: RichTextBlock["elements"] = [];

  const pushGroup = (label: string, items: readonly string[]) => {
    if (items.length === 0) return;
    // Blank line between the two groups for breathing room.
    if (elements.length > 0) {
      elements.push({ type: "rich_text_section", elements: [textEl("\n")] });
    }
    elements.push({
      type: "rich_text_section",
      elements: [textEl(label, true)],
    });
    elements.push({
      type: "rich_text_list",
      style: "bullet",
      elements: items.map((item) => ({
        type: "rich_text_section" as const,
        elements: inlineElements(item),
      })),
    });
  };

  pushGroup("Supporting evidence", evidenceFor);
  pushGroup("Against / ruled out", evidenceAgainst);

  return { type: "rich_text", elements };
}

export function buildReportBlocks(
  report: IncidentReport,
): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
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
        text: `*🔔 Alert Overview*\n${toMrkdwn(report.alertOverview)}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🔍 Hypothesis*\n${toMrkdwn(report.hypothesis.paragraph)}`,
      },
    },
  ];

  const evidence = buildHypothesisEvidenceBlock(report.hypothesis);
  if (evidence) blocks.push(evidence);

  const nextSteps = buildNextStepsBlock(report.nextSteps);
  if (nextSteps) blocks.push({ type: "divider" }, nextSteps);

  const investigation = buildInvestigationStepsBlock(report.investigationSteps);
  if (investigation) blocks.push({ type: "divider" }, investigation);

  blocks.push(
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
  );

  return blocks;
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

// Next steps as markdown
export function formatNextSteps(steps: readonly NextStep[]): string {
  if (steps.length === 0) return "_No next steps provided._";

  const lines: string[] = [];
  for (const { key, label } of NEXT_STEP_GROUPS) {
    const group = steps.filter((s) => s.priority === key);
    if (group.length === 0) continue;
    lines.push(`**${label}**`);
    for (const s of group) {
      lines.push(`- **${s.action}** — ${s.rationale}`);
    }
  }
  return lines.join("\n");
}

// Hypothesis as markdown
export function formatHypothesis(hypothesis: Hypothesis): string {
  const lines = [hypothesis.paragraph];
  if (hypothesis.evidenceFor.length > 0) {
    lines.push("", "**Supporting evidence**");
    lines.push(...hypothesis.evidenceFor.map((e) => `- ${e}`));
  }
  if (hypothesis.evidenceAgainst.length > 0) {
    lines.push("", "**Against / ruled out**");
    lines.push(...hypothesis.evidenceAgainst.map((e) => `- ${e}`));
  }
  return lines.join("\n");
}

export function renderFullReportMarkdown(report: IncidentReport): string {
  return [
    `# ${report.title}`,
    `## Summary\n${report.summary}`,
    `## Alert Overview\n${report.alertOverview}`,
    `## Hypothesis\n${formatHypothesis(report.hypothesis)}`,
    `## Next Steps\n${formatNextSteps(report.nextSteps)}`,
    `## Investigation Steps\n${formatInvestigationSteps(report.investigationSteps)}`,
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
  includeActions = true,
): (Block | KnownBlock)[] {
  const blocks: (Block | KnownBlock)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Investigation failed*\n${toMrkdwn(reason)}`,
      },
    },
  ];

  if (includeActions) {
    blocks.push({
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
    });
  }

  return blocks;
}

export function buildCloseActionBlock(incidentId: string): KnownBlock {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Close", emoji: false },
        action_id: "incident_close",
        style: "danger",
        value: incidentId,
      },
    ],
  };
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
    blocks.push(...buildReportBlocks(inputs.report.report));
  } else {
    blocks.push(...buildIncidentHeaderBlocks(inputs.alert));
  }

  const counter = buildAttachCounterBlock(inputs.attachCount);
  if (counter) blocks.push(counter);

  if (inputs.report && inputs.status === "report_delivered") {
    blocks.push(buildCloseActionBlock(incidentId));
  }

  if (inputs.failure) {
    blocks.push(
      { type: "divider" },
      ...buildIncidentFailedBlocks(
        inputs.failure.reason,
        incidentId,
        inputs.status !== "closed",
      ),
    );
  }

  return blocks;
}
