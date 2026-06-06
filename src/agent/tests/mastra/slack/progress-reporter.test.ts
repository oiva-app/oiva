import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeIncidentRepository } from "../../../src/mastra/testing/fake-incident-repository";
import type { AlertContext } from "../../../src/mastra/types/alert-context";

const mockFns = vi.hoisted(() => ({
  postMessage: vi.fn(),
  update: vi.fn(),
  filesUploadV2: vi.fn(),
}));

vi.mock("@slack/web-api", () => {
  const mockModule = {
    WebClient: function () {
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
  env: { SLACK_BOT_TOKEN: "mock-token", SLACK_CHANNEL_ID: "C-default" },
}));

const { SlackProgressReporter } =
  await import("../../../src/mastra/slack/progress-reporter");

const alert: AlertContext = {
  status: "TRIGGERED",
  isTest: false,
  triggerName: "Too many HTTP request errors",
  description: "trigger description",
  environment: "homelab-env",
  datasets: ["gateway"],
  groupsTriggered: [{ field: "http.route", value: "/api/orders", count: 1 }],
  alert: { timestamp: "2026-06-03T12:00:00Z" },
  resultUrl: "https://ui.honeycomb.io/x",
  triggerUrl: "https://ui.honeycomb.io/x",
  instanceId: "instance-1",
};

describe("SlackProgressReporter", () => {
  let repo: FakeIncidentRepository;
  let reporter: InstanceType<typeof SlackProgressReporter>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    repo = new FakeIncidentRepository();
    reporter = new SlackProgressReporter(repo);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("incidentOpened (idempotency)", () => {
    it("posts a new root and persists thread identity when the incident is fresh", async () => {
      const incident = await repo.create();
      mockFns.postMessage.mockResolvedValue({ ts: "T1", channel: "C-default" });

      await reporter.incidentOpened(incident.id, alert);

      expect(mockFns.postMessage).toHaveBeenCalledTimes(1);
      expect(mockFns.update).not.toHaveBeenCalled();
      const persisted = await repo.findById(incident.id);
      expect(persisted?.slackThreadTs).toBe("T1");
      expect(persisted?.slackChannelId).toBe("C-default");
    });

    it("reuses the persisted thread on cold restart (no new postMessage)", async () => {
      const incident = await repo.create();
      await repo.attachSlackThread(incident.id, {
        slackThreadTs: "T-prior",
        slackChannelId: "C-prior",
      });

      await reporter.incidentOpened(incident.id, alert);
      await vi.runAllTimersAsync();

      expect(mockFns.postMessage).not.toHaveBeenCalled();
      expect(mockFns.update).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "C-prior", ts: "T-prior" }),
      );
    });
  });

  describe("activity events", () => {
    it("silently no-ops when no state exists (no incidentOpened first)", async () => {
      const incident = await repo.create();
      await reporter.statusChanged(incident.id, "investigating");
      await reporter.milestone(incident.id, "Alert verified");
      await vi.runAllTimersAsync();

      expect(mockFns.update).not.toHaveBeenCalled();
      expect(mockFns.postMessage).not.toHaveBeenCalled();
    });

    it("debounces a burst of events into a single chat.update", async () => {
      const incident = await repo.create();
      mockFns.postMessage.mockResolvedValue({ ts: "T1", channel: "C-default" });
      await reporter.incidentOpened(incident.id, alert);

      await reporter.statusChanged(incident.id, "investigating");
      await reporter.milestone(incident.id, "Alert verified");
      await reporter.alertAttached(incident.id);
      await reporter.alertAttached(incident.id);

      expect(mockFns.update).not.toHaveBeenCalled(); // debounced
      await vi.runAllTimersAsync();
      expect(mockFns.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("incidentClosed", () => {
    it("reaper-close posts a threaded reply, does not chat.update the root", async () => {
      const incident = await repo.create();
      await repo.attachSlackThread(incident.id, {
        slackThreadTs: "T-prior",
        slackChannelId: "C-prior",
      });
      mockFns.postMessage.mockResolvedValue({});

      await reporter.incidentClosed(incident.id, { kind: "reaper" });

      expect(mockFns.update).not.toHaveBeenCalled();
      expect(mockFns.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "C-prior", thread_ts: "T-prior" }),
      );
    });
  });

  it("user-close posts a threaded reply with a lock + attribution", async () => {
    const incident = await repo.create();
    mockFns.postMessage.mockResolvedValue({ ts: "T1", channel: "C-default" });
    await reporter.incidentOpened(incident.id, alert);
    await vi.runAllTimersAsync();
    mockFns.update.mockClear();
    mockFns.postMessage.mockClear();

    await reporter.incidentClosed(incident.id, {
      kind: "user",
      userId: "U123",
    });

    expect(mockFns.update).not.toHaveBeenCalled();
    expect(mockFns.postMessage).toHaveBeenCalledTimes(1);
    const args = mockFns.postMessage.mock.calls[0][0];
    expect(args).toMatchObject({ channel: "C-default", thread_ts: "T1" });
    const rendered = JSON.stringify(args.blocks);
    expect(rendered).toContain("<@U123>");
    expect(rendered).toContain("🔒"); // lock on the close reply
  });

  describe("safe wrapper", () => {
    it("swallows Slack API errors and logs structured fields", async () => {
      const errorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      mockFns.postMessage.mockRejectedValue(new Error("rate_limited"));
      const incident = await repo.create();

      await expect(
        reporter.incidentOpened(incident.id, alert),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(
        "SlackProgressReporter method failed",
        expect.objectContaining({
          method: "incidentOpened",
          incidentId: incident.id,
          errorMessage: "rate_limited",
        }),
      );
      errorSpy.mockRestore();
    });
  });
});
