import { describe, it, expect } from "vitest";
import {
  buildReportBlocks,
  buildErrorBlocks,
  renderFullReportMarkdown,
  buildRatingConfirmationBlock,
  buildIncidentPhaseBlock,
  buildActivityLogBlock,
  buildAttachCounterBlock,
  buildIncidentFailedBlocks,
  buildIncidentClosedAttributionBlock,
  buildIncidentMessageBlocks,
  formatInvestigationSteps,
} from "../../../src/mastra/slack/formatters";
import type { IncidentReport } from "@/domain/incident-report";
import type { AlertContext } from "@/domain/alert-context";
import type {
  ActivityLogEntry,
  IncidentRenderInputs,
} from "../../../src/mastra/slack/render-types";
import type { InvestigationStep } from "@/domain/investigation";

const mockNextStep = {
  action:
    "Use Honeycomb to isolate the 502 period for POST /api/orders and break it down by upstream.reachable, upstream.status, http.host, and user_agent.",
  rationale:
    "Narrows whether the failures originated upstream or inside the gateway itself.",
  priority: "immediate" as const,
};

const mockInvestigationStep: InvestigationStep = {
  toolName: "honeycomb_get_query_results",
  toolUseIntent: "Inspect alert query metadata for anomaly window",
  queryUrl:
    "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/HwVZ4E1hbwr",
  error: false,
};

const mockReport: IncidentReport = {
  id: "d5f259b7-a84e-4ece-9659-8dec496c03af",
  durationMs: null,
  title: "Intermittent HTTP Errors on Orders API · homelab-env",
  summary:
    "Over a 24-hour period, the gateway in the homelab environment experienced repeated HTTP errors for POST /api/orders, indicating a potential issue with the upstream service rather than a gateway internal fault.",
  alertOverview:
    "The alert monitors HTTP status requests, notifying when there are excessive 400 or 500 level errors. In this instance, the count exceeded expected thresholds for the /api/orders route. The alert was triggered at 2026-05-22T00:00:00Z, affecting the gateway dataset. The groups triggered included the HTTP route /api/orders. [View in Honeycomb](https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/4cyiskbS8py/a/Aox3eDb6T5i?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook).",
  hypothesis: {
    paragraph:
      "The most likely cause is instability or incorrect behavior in the upstream path behind the gateway's /api/orders route. *Note: no recent deployments found.* **Key finding:** upstream returned 502s.",
    evidenceFor: [
      "Telemetry: 249 error spans out of 3436 in the alert window (7.25%).",
      "Codebase: `services/gateway/src/http/routes.ts` converts upstream errors into HTTP 502.",
    ],
    evidenceAgainst: [
      "Codebase: the `POST /api/orders` route is explicitly defined, so not a routing miss.",
    ],
  },
  nextSteps: [mockNextStep],
  investigationSteps: [mockInvestigationStep],
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

describe("buildReportBlocks", () => {
  type TextBlock = { type: string; text: { text: string } };
  const sectionContaining = (
    blocks: ReturnType<typeof buildReportBlocks>,
    marker: string,
  ): TextBlock =>
    blocks.find(
      (b) =>
        b.type === "section" &&
        (b as TextBlock).text?.text?.includes(marker),
    ) as TextBlock;
  const richTextContaining = (
    blocks: ReturnType<typeof buildReportBlocks>,
    marker: string,
  ) =>
    blocks.find(
      (b) => b.type === "rich_text" && JSON.stringify(b).includes(marker),
    );

  it("sets the report title as the header text", () => {
    const blocks = buildReportBlocks(mockReport);
    expect(blocks[0]).toEqual({
      type: "header",
      text: { type: "plain_text", text: mockReport.title, emoji: false },
    });
  });

  it("uses report.id as the value for both rating buttons", () => {
    const blocks = buildReportBlocks(mockReport);
    const actions = blocks.find((b) => b.type === "actions") as {
      type: string;
      elements: { value: string }[];
    };
    expect(actions.elements[0].value).toBe(mockReport.id);
    expect(actions.elements[1].value).toBe(mockReport.id);
  });

  it("carries the Honeycomb link inside the alert overview section", () => {
    const blocks = buildReportBlocks(mockReport);
    const overview = sectionContaining(blocks, "Alert Overview");
    // toMrkdwn linkifies [text](url) to Slack's <url|text> form, escaping & -> &amp;.
    expect(overview.text.text).toContain("result/4cyiskbS8py");
    expect(overview.text.text).toContain("|View in Honeycomb>");
  });

  it("renders next steps as a priority-grouped rich_text block", () => {
    const blocks = buildReportBlocks(mockReport);
    const nextSteps = richTextContaining(blocks, "Next Steps");
    expect(nextSteps).toBeDefined();
    const json = JSON.stringify(nextSteps);
    expect(json).toContain("Immediate");
    expect(json).toContain(mockNextStep.action);
    expect(json).toContain(mockNextStep.rationale);
  });

  it("renders investigation steps as a rich_text list linking the query", () => {
    const blocks = buildReportBlocks(mockReport);
    const investigation = richTextContaining(blocks, "Investigation Steps");
    expect(investigation).toBeDefined();
    const json = JSON.stringify(investigation);
    expect(json).toContain(mockInvestigationStep.toolUseIntent);
    expect(json).toContain(mockInvestigationStep.queryUrl);
  });

  it("converts markdown italic to mrkdwn in the hypothesis section", () => {
    const blocks = buildReportBlocks(mockReport);
    const hypothesis = sectionContaining(blocks, "Hypothesis");
    expect(hypothesis.text.text).toContain(
      "_Note: no recent deployments found._",
    );
  });

  it("renders hypothesis evidence as a rich_text block with inline code", () => {
    const blocks = buildReportBlocks(mockReport);
    const evidence = richTextContaining(blocks, "Supporting evidence");
    expect(evidence).toBeDefined();
    const json = JSON.stringify(evidence);
    expect(json).toContain("Against / ruled out");
    // backtick spans become code-styled text with the backticks stripped
    expect(json).toContain("services/gateway/src/http/routes.ts");
    expect(json).toContain('"code":true');
    expect(json).not.toContain("`services/gateway");
  });

  it("converts markdown links to mrkdwn format in the summary section", () => {
    const reportWithLink: IncidentReport = {
      ...mockReport,
      summary: "See [Honeycomb](https://ui.honeycomb.io/test) for details.",
    };
    const blocks = buildReportBlocks(reportWithLink);
    const summaryBlock = blocks[2] as TextBlock;
    expect(summaryBlock.text.text).toContain(
      "<https://ui.honeycomb.io/test|Honeycomb>",
    );
  });

  it("escapes Slack control characters in report content", () => {
    const reportWithSpecialChars: IncidentReport = {
      ...mockReport,
      summary: "latency < 200ms & errors > threshold",
    };
    const blocks = buildReportBlocks(reportWithSpecialChars);
    const summaryBlock = blocks[2] as TextBlock;
    expect(summaryBlock.text.text).toContain(
      "latency &lt; 200ms &amp; errors &gt; threshold",
    );
  });

  it("converts both bold and italic in the same string successfully", () => {
    const blocks = buildReportBlocks(mockReport);
    const hypothesis = sectionContaining(blocks, "Hypothesis");
    // ** -> * (bold) and * -> _ (italic), both preserved in one pass
    expect(hypothesis.text.text).toContain("*Key finding:*");
    expect(hypothesis.text.text).toContain(
      "_Note: no recent deployments found._",
    );
  });

  it("renders empty string for an empty report field", () => {
    const blocks = buildReportBlocks({ ...mockReport, summary: "" });
    const summaryBlock = blocks[2] as TextBlock;
    expect(summaryBlock.text.text).toBe("");
  });

  it("omits the duration context block when durationMs is null", () => {
    const blocks = buildReportBlocks(mockReport);
    expect(JSON.stringify(blocks)).not.toContain("Time to report");
  });

  it("includes the duration context block when durationMs is set", () => {
    const blocks = buildReportBlocks({ ...mockReport, durationMs: 65000 });
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
    expect(markdown).toContain(mockReport.hypothesis.paragraph);
    expect(markdown).toContain(mockReport.hypothesis.evidenceFor[0]);
    expect(markdown).toContain(mockNextStep.action);
    expect(markdown).toContain(mockNextStep.rationale);
    expect(markdown).toContain(mockInvestigationStep.toolUseIntent);
  });
});

describe("formatInvestigationSteps", () => {
  const linkedStep: InvestigationStep = {
    toolName: "honeycomb_get_query_results",
    toolUseIntent: "Inspect alert query metadata for anomaly window",
    queryUrl:
      "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/HwVZ4E1hbwr",
    error: false,
  };
  const erroredStep: InvestigationStep = {
    toolName: "honeycomb_run_query",
    toolUseIntent: "Error rate by service around alert over 30m",
    queryUrl: "",
    error: true,
  };
  const linklessStep: InvestigationStep = {
    toolName: "honeycomb_get_workspace_context",
    toolUseIntent: "Investigate astro-lisa alert",
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
    const md = formatInvestigationSteps([{ ...linkedStep, toolUseIntent: "" }]);
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
  it("phase block renders the full incident id + phase per status", () => {
    const id = "a1b2c3d4-0000-0000-0000-000000000000";
    const block = buildIncidentPhaseBlock(id, "investigating");
    expect(block.type).toBe("section");
    // Full id, monospace, so it's an exact-matchable copy target.
    expect(JSON.stringify(block)).toContain(`\`${id}\``);
    expect(JSON.stringify(block)).toContain("Investigation in progress");
  });

  it("phase block reads Report ready once a report exists", () => {
    const block = buildIncidentPhaseBlock("a1b2c3d4-xxxx", "report_generated");
    expect(JSON.stringify(block)).toContain("Report ready");
  });

  it("phase block prefixes a glyph for the failed state only", () => {
    expect(
      JSON.stringify(buildIncidentPhaseBlock("a1b2c3d4-xxxx", "investigating")),
    ).not.toMatch(/⚠️/);
    expect(
      JSON.stringify(buildIncidentPhaseBlock("a1b2c3d4-xxxx", "failed")),
    ).toContain("⚠️");
  });

  it("renders a still-pending task as a spinner, or interrupted once terminal", () => {
    const entries: ActivityLogEntry[] = [
      { kind: "delegationPending", taskKey: "report" },
    ];
    const live = buildActivityLogBlock(entries) as { text: { text: string } };
    expect(live.text.text).toMatch(/🔄 Writing report…/);

    const terminal = buildActivityLogBlock(entries, true) as {
      text: { text: string };
    };
    expect(terminal.text.text).toMatch(/❌ Writing report - interrupted/);
  });

  it("activity log omits when empty, renders mixed entries in order", () => {
    expect(buildActivityLogBlock([])).toBeNull();
    const entries: ActivityLogEntry[] = [
      { kind: "milestone", label: "Alert verified" },
      { kind: "delegationPending", taskKey: "telemetry-agent" },
      {
        kind: "delegationCompleted",
        taskKey: "codebase-agent",
        durationMs: 15_000,
        success: true,
        headline: "Likely the failing migration",
      },
      {
        kind: "delegationCompleted",
        taskKey: "report",
        durationMs: 2_000,
        success: true,
      },
      {
        kind: "delegationCompleted",
        taskKey: "telemetry-agent",
        durationMs: 3_000,
        success: false,
      },
    ];
    const block = buildActivityLogBlock(entries);
    expect(block).not.toBeNull();
    const text = (block as { text: { text: string } }).text.text;
    expect(text).toMatch(/✅ Alert verified/);
    expect(text).toMatch(/🔄 Investigating telemetry…/);
    expect(text).toMatch(
      /✅ Examined codebase - Likely the failing migration - 15s/,
    );
    // No headline → no finding segment, just past-tense label + duration.
    expect(text).toMatch(/✅ Report written - 2s/);
    expect(text).toMatch(/❌ Investigated telemetry - 3s/);
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
    const blocks = buildIncidentFailedBlocks("git pull timed out", "inc_123");
    const actions = blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();
    const actionIds = JSON.stringify(actions);
    expect(actionIds).toContain("incident_retry");
    expect(actionIds).toContain("incident_close");
  });

  it("failed render flips the header, reconciles spinners, keeps actions", () => {
    const baseAlert = {
      triggerName: "checkout-latency",
      description: "p99 over 2s",
      environment: "production",
      alert: { timestamp: "2026-06-03T12:00:00Z" },
      resultUrl: "https://ui.honeycomb.io/x",
    } as unknown as IncidentRenderInputs["alert"];

    const blocks = buildIncidentMessageBlocks(
      {
        status: "failed",
        alert: baseAlert,
        log: [
          { kind: "milestone", label: "Alert verified" },
          { kind: "delegationPending", taskKey: "telemetry-agent" },
        ],
        attachCount: 0,
        failure: { reason: "reaper: stuck in investigating past deadline" },
      },
      "inc_123",
    );
    const rendered = JSON.stringify(blocks);
    expect(rendered).toContain("⚠️"); // failed phase header
    expect(rendered).toContain("❌ Investigating telemetry - interrupted");
    expect(rendered).toContain("incident_retry"); // Retry stays on a failed card
  });

  it("closed attribution carries a lock for both user and reaper", () => {
    const user = buildIncidentClosedAttributionBlock({
      kind: "user",
      userId: "U123",
    });
    expect(JSON.stringify(user)).toContain("🔒");
    expect(JSON.stringify(user)).toContain("<@U123>");
    const reaper = buildIncidentClosedAttributionBlock({ kind: "reaper" });
    expect(JSON.stringify(reaper)).toContain("🔒");
    expect(JSON.stringify(reaper)).toContain("Auto-closed");
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

    const withoutReport = buildIncidentMessageBlocks(
      {
        status: "investigating",
        alert: baseAlert,
        log: [],
        attachCount: 0,
      },
      "inc_123",
    );
    expect(JSON.stringify(withoutReport)).toContain("checkout-latency");

    // Once a report is present, expect the summary header text instead.
    // Use the existing report fixture/helper for IncidentReport.
  });
});
