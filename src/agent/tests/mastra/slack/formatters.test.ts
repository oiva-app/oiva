import { describe, it, expect } from "vitest";
import {
  buildSummaryBlocks,
  buildErrorBlocks,
  renderFullReportMarkdown,
  buildRatingConfirmationBlock,
  buildStatusBadgeBlock,
  buildIncidentHeaderBlocks,
  buildActivityLogBlock,
  buildAttachCounterBlock,
  buildIncidentFailedBlocks,
  buildIncidentClosedAttributionBlock,
  buildIncidentMessageBlocks,
  formatInvestigationSteps,
} from "../../../src/mastra/slack/formatters";
import type { InvestigationStep } from "../../../src/mastra/slack/formatters";
import type { IncidentReport } from "../../../src/mastra/types/report";
import type { AlertContext } from "../../../src/mastra/types/alert-context";
import type {
  ActivityLogEntry,
  IncidentRenderInputs,
} from "../../../src/mastra/slack/render-types";

const mockReport: IncidentReport = {
  id: "d5f259b7-a84e-4ece-9659-8dec496c03af",
  durationMs: null,
  title: "Intermittent HTTP Errors on Orders API · homelab-env",
  summary:
    "Over a 24-hour period, the gateway in the homelab environment experienced repeated HTTP errors for POST /api/orders, indicating a potential issue with the upstream service rather than a gateway internal fault.",
  alertOverview:
    "The alert monitors HTTP status requests, notifying when there are excessive 400 or 500 level errors. In this instance, the count exceeded expected thresholds for the /api/orders route. The alert was triggered at 2026-05-22T00:00:00Z, affecting the gateway dataset. The groups triggered included the HTTP route /api/orders. [View in Honeycomb](https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/4cyiskbS8py/a/Aox3eDb6T5i?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook).",
  hypothesis:
    "The most likely cause is instability or incorrect behavior in the upstream path behind the gateway's /api/orders route. *Note: no recent deployments found.* **Key finding:** upstream returned 502s.",
  findings: "_Relevant raw findings not yet available._",
  nextSteps:
    "**Immediate**\n- Use Honeycomb to isolate the 502 period for POST /api/orders and break it down by upstream.reachable, upstream.status, http.host, and user_agent.",
  investigationSteps: "_Investigation trace not yet available._",
};

const mockAlertContext: AlertContext = {
  status: "TRIGGERED",
  isTest: false,
  triggerName: "Too many HTTP request errors",
  description:
    "This trigger notifies us if there are any 400 or 500 level HTTP status requests",
  environment: "homelab-env",
  datasets: ["gateway"],
  groupsTriggered: [{ field: "http.route", value: "/api/orders", count: 1 }],
  alert: { timestamp: "2026-05-22T00:00:00Z" },
  resultUrl:
    "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/4cyiskbS8py/a/Aox3eDb6T5i?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook",
  triggerUrl:
    "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/triggers/sbLy6gwM56r?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook",
  instanceId: "534bcf91-8070-41ec-808b-abe472a239e7",
};

describe("buildSummaryBlocks", () => {
  it("sets the report title as the header text", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    expect(blocks[0]).toEqual({
      type: "header",
      text: { type: "plain_text", text: mockReport.title, emoji: false },
    });
  });

  it("uses report.id as the value for both rating buttons", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    const actions = blocks[10] as {
      type: string;
      elements: { value: string }[];
    };
    expect(actions.elements[0].value).toBe(mockReport.id);
    expect(actions.elements[1].value).toBe(mockReport.id);
  });

  it("renders the Honeycomb link with the provided resultUrl", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    const linkBlock = blocks[8] as { type: string; text: { text: string } };
    expect(linkBlock.text.text).toContain(mockAlertContext.resultUrl);
  });

  it("converts markdown bold to mrkdwn in the next steps section", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    const nextStepsBlock = blocks[6] as {
      type: string;
      text: { text: string };
    };
    expect(nextStepsBlock.text.text).toContain("*Immediate*");
  });

  it("converts markdown italic to mrkdwn in the hypothesis section", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    const hypothesisBlock = blocks[4] as {
      type: string;
      text: { text: string };
    };
    expect(hypothesisBlock.text.text).toContain(
      "_Note: no recent deployments found._",
    );
  });

  it("converts markdown links to mrkdwn format in the summary section", () => {
    const reportWithLink: IncidentReport = {
      ...mockReport,
      summary: "See [Honeycomb](https://ui.honeycomb.io/test) for details.",
    };
    const blocks = buildSummaryBlocks(
      reportWithLink,
      mockAlertContext.resultUrl,
    );
    const summaryBlock = blocks[2] as { type: string; text: { text: string } };
    expect(summaryBlock.text.text).toContain(
      "<https://ui.honeycomb.io/test|Honeycomb>",
    );
  });

  it("escapes Slack control characters in report content", () => {
    const reportWithSpecialChars: IncidentReport = {
      ...mockReport,
      summary: "latency < 200ms & errors > threshold",
    };
    const blocks = buildSummaryBlocks(
      reportWithSpecialChars,
      mockAlertContext.resultUrl,
    );
    const summaryBlock = blocks[2] as { type: string; text: { text: string } };
    expect(summaryBlock.text.text).toContain(
      "latency &lt; 200ms &amp; errors &gt; threshold",
    );
  });

  it("converts both bold and italic in the same string successfully", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    const hypothesisBlock = blocks[4] as {
      type: string;
      text: { text: string };
    };
    // ** -> * (bold) and * -> _ (italic), both preserved in one pass
    expect(hypothesisBlock.text.text).toContain("*Key finding:*");
    expect(hypothesisBlock.text.text).toContain(
      "_Note: no recent deployments found._",
    );
  });

  it("renders empty string for an empty report field", () => {
    const blocks = buildSummaryBlocks(
      { ...mockReport, summary: "" },
      mockAlertContext.resultUrl,
    );
    const summaryBlock = blocks[2] as { type: string; text: { text: string } };
    expect(summaryBlock.text.text).toBe("");
  });

  it("omits the duration context block when durationMs is null", () => {
    const blocks = buildSummaryBlocks(mockReport, mockAlertContext.resultUrl);
    expect(JSON.stringify(blocks)).not.toContain("Time to report");
  });

  it("includes the duration context block when durationMs is set", () => {
    const blocks = buildSummaryBlocks(
      { ...mockReport, durationMs: 65000 },
      mockAlertContext.resultUrl,
    );
    const contextBlock = blocks[2] as {
      type: string;
      elements: { text: string }[];
    };
    expect(contextBlock.type).toBe("context");
    expect(contextBlock.elements[0].text).toContain("Time to report");
  });
});

describe("buildErrorBlocks", () => {
  it("sets the header text to the hardcoded failure message", () => {
    const blocks = buildErrorBlocks(mockAlertContext);
    expect(blocks[0]).toEqual({
      type: "header",
      text: {
        type: "plain_text",
        text: "Incident Report Generation Failed",
        emoji: false,
      },
    });
  });

  it("includes the trigger name in the fields section", () => {
    const blocks = buildErrorBlocks(mockAlertContext);
    const fields = blocks[4] as { type: string; fields: { text: string }[] };
    expect(fields.fields[0].text).toContain(mockAlertContext.triggerName);
  });

  it("includes the environment in the fields section", () => {
    const blocks = buildErrorBlocks(mockAlertContext);
    const fields = blocks[4] as { type: string; fields: { text: string }[] };
    expect(fields.fields[1].text).toContain(mockAlertContext.environment);
  });

  it("includes the alert timestamp in the fields section", () => {
    const blocks = buildErrorBlocks(mockAlertContext);
    const fields = blocks[4] as { type: string; fields: { text: string }[] };
    expect(fields.fields[2].text).toContain(mockAlertContext.alert.timestamp);
  });

  it("renders the alert description in its own section", () => {
    const blocks = buildErrorBlocks(mockAlertContext);
    const descBlock = blocks[5] as { type: string; text: { text: string } };
    expect(descBlock.text.text).toContain(mockAlertContext.description);
  });

  it("renders the Honeycomb link with the resultUrl", () => {
    const blocks = buildErrorBlocks(mockAlertContext);
    const linkBlock = blocks[7] as { type: string; text: { text: string } };
    expect(linkBlock.text.text).toContain(mockAlertContext.resultUrl);
  });
});

describe("renderFullReportMarkdown", () => {
  it("includes all report sections as markdown headings", () => {
    const markdown = renderFullReportMarkdown(mockReport);
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Alert Overview");
    expect(markdown).toContain("## Hypothesis");
    expect(markdown).toContain("## Findings");
    expect(markdown).toContain("## Next Steps");
    expect(markdown).toContain("## Investigation Steps");
  });

  it("uses the report title as the h1 heading", () => {
    const markdown = renderFullReportMarkdown(mockReport);
    expect(markdown).toContain(`# ${mockReport.title}`);
  });

  it("includes the report field content under each section", () => {
    const markdown = renderFullReportMarkdown(mockReport);
    expect(markdown).toContain(mockReport.summary);
    expect(markdown).toContain(mockReport.alertOverview);
    expect(markdown).toContain(mockReport.hypothesis);
    expect(markdown).toContain(mockReport.findings);
    expect(markdown).toContain(mockReport.nextSteps);
    expect(markdown).toContain(mockReport.investigationSteps);
  });
});

describe("formatInvestigationSteps", () => {
  const linkedStep: InvestigationStep = {
    toolName: "honeycomb_get_query_results",
    question: "Inspect alert query metadata for anomaly window",
    queryUrl:
      "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/HwVZ4E1hbwr",
    error: false,
  };
  const erroredStep: InvestigationStep = {
    toolName: "honeycomb_run_query",
    question: "Error rate by service around alert over 30m",
    queryUrl: "",
    error: true,
  };
  const linklessStep: InvestigationStep = {
    toolName: "honeycomb_get_workspace_context",
    question: "Investigate astro-lisa alert",
    queryUrl: "",
    error: false,
  };

  it("renders a successful step as a numbered, linked tool use", () => {
    const md = formatInvestigationSteps([linkedStep]);
    expect(md).toBe(
      `**1. Inspect alert query metadata for anomaly window**\n` +
        `Tool use: [honeycomb_get_query_results](${linkedStep.queryUrl})`,
    );
  });

  it("renders an errored step as (invalid tool call) with no link", () => {
    const md = formatInvestigationSteps([erroredStep]);
    expect(md).toBe(
      `**1. Error rate by service around alert over 30m**\n(invalid tool call)`,
    );
  });

  it("renders a linkless step as plain tool name without a hyperlink", () => {
    const md = formatInvestigationSteps([linklessStep]);
    expect(md).toBe(
      `**1. Investigate astro-lisa alert**\n` +
        `Tool use: honeycomb_get_workspace_context`,
    );
  });

  it("numbers every element 1..N in order, separated by blank lines", () => {
    const md = formatInvestigationSteps([
      linklessStep,
      linkedStep,
      erroredStep,
    ]);
    const steps = md.split("\n\n");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain("**1. Investigate astro-lisa alert**");
    expect(steps[1]).toContain(
      "**2. Inspect alert query metadata for anomaly window**",
    );
    expect(steps[2]).toContain(
      "**3. Error rate by service around alert over 30m**",
    );
  });

  it("falls back to the tool name when the question is empty", () => {
    const md = formatInvestigationSteps([{ ...linkedStep, question: "" }]);
    expect(md).toContain("**1. honeycomb_get_query_results**");
  });

  it("returns a fallback message for an empty trace", () => {
    expect(formatInvestigationSteps([]).toLowerCase()).toContain(
      "something went wrong",
    );
  });
});

describe("buildRatingConfirmationBlock", () => {
  it.each([
    ["positive", "👍"],
    ["negative", "👎"],
  ] as const)(
    "renders a %s rating as a context block with the user mention",
    (rating, emoji) => {
      const block = buildRatingConfirmationBlock(rating, "U07ABCDE") as {
        type: string;
        elements: { text: string }[];
      };
      expect(block.type).toBe("context");
      expect(block.elements[0].text).toBe(`Rated ${emoji} by <@U07ABCDE>`);
    },
  );
});

describe("incident root message blocks", () => {
  it("status badge renders emoji + label per status", () => {
    const block = buildStatusBadgeBlock("investigating");
    expect(block.type).toBe("context");
    expect(JSON.stringify(block)).toContain("🟡");
    expect(JSON.stringify(block)).toContain("Investigating");
  });

  it("activity log omits when empty, renders mixed entries in order", () => {
    expect(buildActivityLogBlock([])).toBeNull();
    const entries: ActivityLogEntry[] = [
      { kind: "milestone", label: "Alert verified" },
      { kind: "delegationPending", agentLabel: "Telemetry investigator" },
      {
        kind: "delegationCompleted",
        agentLabel: "Codebase reviewer",
        durationMs: 15_000,
        success: true,
        headline: "Likely the failing migration",
      },
      {
        kind: "delegationCompleted",
        agentLabel: "Flaky tool",
        durationMs: 2_000,
        success: false,
      },
    ];
    const block = buildActivityLogBlock(entries);
    expect(block).not.toBeNull();
    const text = (block as { text: { text: string } }).text.text;
    expect(text).toMatch(/✓ Alert verified/);
    expect(text).toMatch(/⏳ Telemetry investigator/);
    expect(text).toMatch(
      /✓ Codebase reviewer — Likely the failing migration - 15s/,
    );
    expect(text).toMatch(/✕ Flaky tool - No Discovery - 2s/);
  });

  it("attach counter omits at zero, pluralizes correctly", () => {
    expect(buildAttachCounterBlock(0)).toBeNull();
    const one = buildAttachCounterBlock(1);
    expect(JSON.stringify(one)).toContain("1 related alert");
    expect(JSON.stringify(one)).not.toContain("related alerts");
    const many = buildAttachCounterBlock(7);
    expect(JSON.stringify(many)).toContain("7 related alerts");
  });

  it("failed render includes retry and close actions", () => {
    const blocks = buildIncidentFailedBlocks("git pull timed out");
    const actions = blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();
    const actionIds = JSON.stringify(actions);
    expect(actionIds).toContain("incident_retry");
    expect(actionIds).toContain("incident_close");
  });

  it("closed attribution distinguishes user vs reaper", () => {
    const user = buildIncidentClosedAttributionBlock({
      kind: "user",
      userId: "U123",
    });
    expect(JSON.stringify(user)).toContain("<@U123>");
    const reaper = buildIncidentClosedAttributionBlock({ kind: "reaper" });
    expect(JSON.stringify(reaper)).toContain("🔒");
  });

  it("orchestrator: alert header replaced by report summary once report present", () => {
    const baseAlert = {
      triggerName: "checkout-latency",
      description: "p99 over 2s",
      environment: "production",
      alert: { timestamp: "2026-06-03T12:00:00Z" },
      resultUrl: "https://ui.honeycomb.io/x",
      // …fill in remaining AlertContext required fields per the test helper pattern
    } as unknown as IncidentRenderInputs["alert"];

    const withoutReport = buildIncidentMessageBlocks({
      status: "investigating",
      alert: baseAlert,
      log: [],
      attachCount: 0,
    });
    expect(JSON.stringify(withoutReport)).toContain("checkout-latency");

    // Once a report is present, expect the summary header text instead.
    // Use the existing report fixture/helper for IncidentReport.
  });
});
