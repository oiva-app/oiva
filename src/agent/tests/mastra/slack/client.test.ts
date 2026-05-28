import { vi, describe, it, expect, beforeEach } from "vitest";
import type { IncidentReport } from "../../../src/mastra/types/report";
import type { AlertContext } from "../../../src/mastra/types/alert-context";

const mockFns = vi.hoisted(() => ({
  postMessage: vi.fn(),
  filesUploadV2: vi.fn(),
}));

vi.mock("@slack/web-api", () => ({
  WebClient: function () {
    return {
      chat: { postMessage: mockFns.postMessage },
      filesUploadV2: mockFns.filesUploadV2,
    };
  },
}));

vi.mock("../../../src/mastra/config/env", () => ({
  env: {
    SLACK_BOT_TOKEN: "mock-token",
    SLACK_CHANNEL_ID: "mock-channel-id",
  },
}));

const {
  postReportSummary,
  uploadFileToThread,
  postRatingConfirmation,
  postErrorMessage,
  postErrorToThread,
} = await import("../../../src/mastra/slack/client");

const mockReport: IncidentReport = {
  id: "d5f259b7-a84e-4ece-9659-8dec496c03af",
  title: "Intermittent HTTP Errors on Orders API · homelab-env",
  summary: "Over a 24-hour period, the gateway experienced repeated HTTP errors for POST /api/orders.",
  alertOverview: "The alert monitors HTTP status requests.",
  hypothesis: "The most likely cause is instability in the upstream path.",
  findings: "_Relevant raw findings not yet available._",
  nextSteps: "**Immediate**\n- Use Honeycomb to isolate the 502 period.",
  investigationSteps: "_Investigation trace not yet available._",
};

const mockAlertContext: AlertContext = {
  status: "TRIGGERED",
  isTest: false,
  triggerName: "Too many HTTP request errors",
  description: "This trigger notifies us if there are any 400 or 500 level HTTP status requests",
  environment: "homelab-env",
  datasets: ["gateway"],
  groupsTriggered: [{ field: "http.route", value: "/api/orders", count: 1 }],
  alert: { timestamp: "2026-05-22T00:00:00Z" },
  resultUrl: "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/result/4cyiskbS8py/a/Aox3eDb6T5i?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook",
  triggerUrl: "https://ui.honeycomb.io/vracine-homelab/environments/homelab-env/datasets/gateway/triggers/sbLy6gwM56r?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook",
  instanceId: "534bcf91-8070-41ec-808b-abe472a239e7",
};

describe("slack client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("postReportSummary", () => {
    it("posts to the configured channel and returns the message timestamp", async () => {
      mockFns.postMessage.mockResolvedValue({ ts: "mock-ts-123" });
      const ts = await postReportSummary(mockReport, mockAlertContext.resultUrl);
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "mock-channel-id" }),
      );
      expect(ts).toBe("mock-ts-123");
    });

    it("throws if the Slack API does not return a timestamp", async () => {
      mockFns.postMessage.mockResolvedValue({ ts: undefined });
      await expect(
        postReportSummary(mockReport, mockAlertContext.resultUrl),
      ).rejects.toThrow("Slack API did not return a message timestamp.");
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
          filename: `oiva-incident-report-${mockReport.id}.md`,
        }),
      );
    });
  });

  describe("postRatingConfirmation", () => {
    it("posts a positive rating confirmation to the thread", async () => {
      mockFns.postMessage.mockResolvedValue({});
      await postRatingConfirmation("mock-ts-123", "positive", "jane");
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: "mock-ts-123",
          text: expect.stringContaining("👍"),
        }),
      );
    });

    it("posts a negative rating confirmation to the thread", async () => {
      mockFns.postMessage.mockResolvedValue({});
      await postRatingConfirmation("mock-ts-123", "negative", "jane");
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: "mock-ts-123",
          text: expect.stringContaining("👎"),
        }),
      );
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
