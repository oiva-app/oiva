import { describe, it, expect } from "vitest";
import {
  buildSummaryBlocks,
  buildErrorBlocks,
  renderFullReportMarkdown,
} from "../../../src/mastra/slack/formatters";
import type { IncidentReport } from "../../../src/mastra/types/report";
import type { AlertContext } from "../../../src/mastra/types/alert-context";

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
    expect(markdown).toContain(mockReport.hypothesis);
    expect(markdown).toContain(mockReport.nextSteps);
  });
});
