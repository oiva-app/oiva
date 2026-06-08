import { vi, describe, it, expect, beforeEach } from "vitest";
import type { IncidentReport } from "../../../src/mastra/types/report";
import type { AlertContext } from "../../../src/mastra/types/alert-context";

const mockFns = vi.hoisted(() => ({
  postMessage: vi.fn(),
  filesUploadV2: vi.fn(),
  update: vi.fn(),
  capturedConfig: null as unknown,
}));

vi.mock("@slack/web-api", () => {
  const mockModule = {
    WebClient: function (_token: string, config?: unknown) {
      mockFns.capturedConfig = config;
      return {
        chat: { postMessage: mockFns.postMessage, update: mockFns.update },
        filesUploadV2: mockFns.filesUploadV2,
      };
    },
  };
  return {
    default: mockModule,
    ...mockModule,
  };
});

vi.mock("@slack/web-api/dist/retry-policies", () => ({
  fiveRetriesInFiveMinutes: { policyName: "fiveRetriesInFiveMinutes" },
}));

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    SLACK_BOT_TOKEN: "mock-token",
    SLACK_CHANNEL_ID: "mock-channel-id",
  },
}));

const {
  postReportSummary,
  postIncidentRoot,
  updateIncidentMessage,
  postThreadReply,
  uploadFileToThread,
  postRatingConfirmation,
  postErrorMessage,
  postErrorToThread,
} = await import("../../../src/mastra/slack/client");

const mockReport: IncidentReport = {
  id: "d5f259b7-a84e-4ece-9659-8dec496c03af",
  durationMs: null,
  title: "Intermittent HTTP Errors on Orders API · homelab-env",
  summary:
    "Over a 24-hour period, the gateway experienced repeated HTTP errors for POST /api/orders.",
  alertOverview: "The alert monitors HTTP status requests.",
  hypothesis: {
    paragraph: "The most likely cause is instability in the upstream path.",
    evidenceFor: ["Telemetry: 7.25% error rate during the alert window."],
    evidenceAgainst: [],
  },
  nextSteps: [
    {
      action: "Use Honeycomb to isolate the 502 period.",
      rationale: "Confirms whether the failures originated upstream.",
      priority: "immediate",
    },
  ],
  investigationSteps: [
    {
      toolName: "honeycomb_get_query_results",
      toolUseIntent: "Inspect alert query metadata",
      queryUrl: "https://ui.honeycomb.io/x/result/abc",
      error: false,
    },
  ],
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

describe("slack client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("WebClient construction", () => {
    it("uses the fiveRetriesInFiveMinutes retry policy", () => {
      expect(mockFns.capturedConfig).toEqual({
        retryConfig: { policyName: "fiveRetriesInFiveMinutes" },
      });
    });
  });

  describe("postReportSummary", () => {
    it("posts to the configured channel and returns the message timestamp and channel", async () => {
      mockFns.postMessage.mockResolvedValue({
        ts: "mock-ts-123",
        channel: "mock-channel-id",
      });
      const threadData = await postReportSummary(mockReport);
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "mock-channel-id" }),
      );
      expect(threadData).toStrictEqual({
        ts: "mock-ts-123",
        channel: "mock-channel-id",
      });
    });

    it("throws if the Slack API does not return a timestamp", async () => {
      mockFns.postMessage.mockResolvedValue({ ts: undefined });
      await expect(postReportSummary(mockReport)).rejects.toThrow(
        "Slack API did not return a message timestamp.",
      );
    });

    it("throws if the Slack API does not return a channel", async () => {
      mockFns.postMessage.mockResolvedValue({
        ts: "mock-ts-123",
        channel: undefined,
      });
      await expect(postReportSummary(mockReport)).rejects.toThrow(
        "Slack API did not return a channel",
      );
    });
  });

  describe("postIncidentRoot", () => {
    const blocks = [{ type: "section", text: { type: "mrkdwn", text: "hi" } }];

    it("posts to the configured channel with provided blocks and fallback text", async () => {
      mockFns.postMessage.mockResolvedValue({
        ts: "mock-ts-1",
        channel: "mock-channel-id",
      });

      const result = await postIncidentRoot({
        blocks,
        fallbackText: "Investigating: trigger",
      });

      expect(mockFns.postMessage).toHaveBeenCalledWith({
        channel: "mock-channel-id",
        blocks,
        text: "Investigating: trigger",
      });
      expect(result).toStrictEqual({
        ts: "mock-ts-1",
        channel: "mock-channel-id",
      });
    });

    it("throws if the Slack API does not return a timestamp", async () => {
      mockFns.postMessage.mockResolvedValue({ ts: undefined });
      await expect(
        postIncidentRoot({ blocks, fallbackText: "x" }),
      ).rejects.toThrow("Slack API did not return a message timestamp.");
    });

    it("throws if the Slack API does not return a channel", async () => {
      mockFns.postMessage.mockResolvedValue({
        ts: "mock-ts-1",
        channel: undefined,
      });
      await expect(
        postIncidentRoot({ blocks, fallbackText: "x" }),
      ).rejects.toThrow("Slack API did not return a channel.");
    });
  });

  describe("updateIncidentMessage", () => {
    it("calls chat.update with channel, ts, blocks, and fallback text", async () => {
      mockFns.update.mockResolvedValue({});
      const blocks = [{ type: "section", text: { type: "mrkdwn", text: "x" } }];

      await updateIncidentMessage({
        channel: "C123",
        ts: "T456",
        blocks,
        fallbackText: "Status update",
      });

      expect(mockFns.update).toHaveBeenCalledWith({
        channel: "C123",
        ts: "T456",
        blocks,
        text: "Status update",
      });
    });
  });

  describe("postThreadReply", () => {
    it("posts to the given channel + thread_ts with provided blocks and fallback text", async () => {
      mockFns.postMessage.mockResolvedValue({});
      const blocks = [{ type: "section", text: { type: "mrkdwn", text: "x" } }];

      await postThreadReply({
        channel: "C123",
        threadTs: "T456",
        blocks,
        fallbackText: "Auto-closed",
      });

      expect(mockFns.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "T456",
        blocks,
        text: "Auto-closed",
      });
    });
  });

  describe("uploadFileToThread", () => {
    it("uploads the full report markdown to the thread", async () => {
      mockFns.filesUploadV2.mockResolvedValue({});
      await uploadFileToThread("mock-ts-123", mockReport);
      expect(mockFns.filesUploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          channel_id: "mock-channel-id",
          thread_ts: "mock-ts-123",
          content: expect.any(String),
          title: mockReport.title,
          filename: `oiva-incident-report-${mockReport.id}.md`,
        }),
      );
    });
  });

  describe("postRatingConfirmation", () => {
    const originalBlocks = [
      { type: "section", text: { type: "mrkdwn", text: "summary" } },
      { type: "actions", elements: [] },
    ];
    it("updates the report summary with a positive rating", async () => {
      mockFns.update.mockResolvedValue({});
      await postRatingConfirmation(
        "mock-ts-123",
        "mock-channel-123",
        originalBlocks,
        "positive",
        "U07ABCDE",
      );

      const { blocks } = mockFns.update.mock.calls[0][0];
      expect(blocks.some((b: { type: string }) => b.type === "actions")).toBe(
        false,
      );

      expect(mockFns.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "mock-channel-123",
          ts: "mock-ts-123",
        }),
      );
      expect(JSON.stringify(blocks)).toContain("👍");
      expect(JSON.stringify(blocks)).toContain("<@U07ABCDE>");
    });

    it("updates the report summary with a negative rating", async () => {
      mockFns.update.mockResolvedValue({});
      await postRatingConfirmation(
        "mock-ts-123",
        "mock-channel-123",
        originalBlocks,
        "negative",
        "U07ABCDE",
      );
      const { blocks } = mockFns.update.mock.calls[0][0];
      expect(blocks.some((b: { type: string }) => b.type === "actions")).toBe(
        false,
      );

      expect(mockFns.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "mock-channel-123",
          ts: "mock-ts-123",
        }),
      );
      expect(JSON.stringify(blocks)).toContain("👎");
      expect(JSON.stringify(blocks)).toContain("<@U07ABCDE>");
    });
  });

  describe("postErrorMessage", () => {
    it("posts error blocks to the configured channel", async () => {
      mockFns.postMessage.mockResolvedValue({});
      await postErrorMessage(mockAlertContext);
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "mock-channel-id" }),
      );
    });
  });

  describe("postErrorToThread", () => {
    it("posts a plain text error message to the thread", async () => {
      mockFns.postMessage.mockResolvedValue({});
      await postErrorToThread("mock-ts-123");
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "mock-channel-id",
          thread_ts: "mock-ts-123",
        }),
      );
    });
  });
});
