import type {
  ClosedBy,
  DelegationOutcome,
  ProgressReporter,
} from "../ports/progress-reporter";
import type {
  IncidentRepository,
  IncidentStatus,
} from "../ports/incident-repository";
import type { AlertContext } from "../types/alert-context";
import type { IncidentReport } from "../types/report";
import type { ActivityLogEntry, IncidentRenderInputs } from "./render-types";
import {
  buildIncidentClosedAttributionBlock,
  buildIncidentMessageBlocks,
} from "./formatters";
import {
  postIncidentRoot,
  postThreadReply,
  updateIncidentMessage,
  uploadFileToThread,
} from "./client";

const DEBOUNCE_MS = 300;

interface RenderState extends Omit<IncidentRenderInputs, "log"> {
  threadTs: string;
  channelId: string;
  log: ActivityLogEntry[]; // mutable; readonly only on the port surface
}

export class SlackProgressReporter implements ProgressReporter {
  private readonly states = new Map<string, RenderState>();
  private readonly pending = new Map<
    string,
    { timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private readonly incidents: IncidentRepository) {}

  // ── Lifecycle ─────────────────────────────────────────────────────

  async incidentOpened(incidentId: string, alert: AlertContext): Promise<void> {
    return this.safe("incidentOpened", incidentId, async () => {
      const inMemory = this.states.get(incidentId);
      if (inMemory) {
        this.reseedForRetry(inMemory, alert);
        this.scheduleFlush(incidentId);
        return;
      }

      const persisted = await this.incidents.findById(incidentId);
      if (persisted?.slackThreadTs && persisted.slackChannelId) {
        this.states.set(incidentId, {
          status: "triggered",
          alert,
          log: [],
          attachCount: 0,
          threadTs: persisted.slackThreadTs,
          channelId: persisted.slackChannelId,
        });
        this.scheduleFlush(incidentId);
        return;
      }

      // Fresh: post new root + persist thread identity.
      const initialInputs: IncidentRenderInputs = {
        status: "triggered",
        alert,
        log: [],
        attachCount: 0,
      };
      const { ts, channel } = await postIncidentRoot({
        blocks: buildIncidentMessageBlocks(initialInputs, incidentId),
        fallbackText: `Investigating: ${alert.triggerName}`,
      });
      this.states.set(incidentId, {
        status: "triggered",
        alert,
        log: [],
        attachCount: 0,
        threadTs: ts,
        channelId: channel,
      });
      await this.incidents.attachSlackThread(incidentId, {
        slackThreadTs: ts,
        slackChannelId: channel,
      });
    });
  }

  async statusChanged(
    incidentId: string,
    status: IncidentStatus,
  ): Promise<void> {
    return this.safe("statusChanged", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      state.status = status;
      this.scheduleFlush(incidentId);
    });
  }

  // ── Activity ──────────────────────────────────────────────────────

  async milestone(incidentId: string, label: string): Promise<void> {
    return this.safe("milestone", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      state.log.push({ kind: "milestone", label });
      this.scheduleFlush(incidentId);
    });
  }

  async delegationStarted(incidentId: string, taskKey: string): Promise<void> {
    return this.safe("delegationStarted", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      state.log.push({ kind: "delegationPending", taskKey });
      this.scheduleFlush(incidentId);
    });
  }

  async delegationCompleted(
    incidentId: string,
    taskKey: string,
    outcome: DelegationOutcome,
  ): Promise<void> {
    return this.safe("delegationCompleted", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      const completed: ActivityLogEntry = {
        kind: "delegationCompleted",
        taskKey,
        durationMs: outcome.durationMs,
        success: outcome.success,
        headline: outcome.headline,
      };
      // Replace the most recent matching pending entry in place so visual
      // ordering doesn't shift; if no pending exists (out-of-order), append.
      const idx = findLastPendingIndex(state.log, taskKey);
      if (idx !== -1) state.log.splice(idx, 1, completed);
      else state.log.push(completed);
      this.scheduleFlush(incidentId);
    });
  }

  async alertAttached(incidentId: string): Promise<void> {
    return this.safe("alertAttached", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      state.attachCount += 1;
      this.scheduleFlush(incidentId);
    });
  }

  // ── Terminal renders ──────────────────────────────────────────────

  async reportReady(
    incidentId: string,
    report: IncidentReport,
    resultUrl: string,
  ): Promise<void> {
    return this.safe("reportReady", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      state.report = { report, resultUrl };
      await this.persistSnapshot(incidentId, state);
      await this.flushNow(incidentId);
    });
  }

  async attachReportFile(
    incidentId: string,
    report: IncidentReport,
  ): Promise<void> {
    return this.safe("attachReportFile", incidentId, async () => {
      const persisted = await this.incidents.findById(incidentId);

      if (!persisted?.slackThreadTs) return;

      await uploadFileToThread(persisted.slackThreadTs, report);
    });
  }

  async incidentFailed(
    incidentId: string,
    failure: { reason: string },
  ): Promise<void> {
    return this.safe("incidentFailed", incidentId, async () => {
      const state = this.states.get(incidentId);
      if (!state) return;
      state.status = "failed";
      state.failure = failure;
      await this.persistSnapshot(incidentId, state);
      await this.flushNow(incidentId);
    });
  }

  async incidentClosed(incidentId: string, by: ClosedBy): Promise<void> {
    return this.safe("incidentClosed", incidentId, async () => {
      const persisted = await this.incidents.findById(incidentId);
      if (!persisted?.slackThreadTs || !persisted.slackChannelId) return;

      // Re-render the root message as closed so its Close button is removed.
      try {
        await this.rerenderClosed(
          incidentId,
          persisted.slackChannelId,
          persisted.slackThreadTs,
        );
      } catch (err) {
        console.error("Failed to re-render root message as closed", {
          incidentId,
          err,
        });
      }

      // The thread reply is the only surface that notifies, and carries who/auto.
      await postThreadReply({
        channel: persisted.slackChannelId,
        threadTs: persisted.slackThreadTs,
        blocks: [buildIncidentClosedAttributionBlock(by)],
        fallbackText:
          by.kind === "user" ? "Incident closed" : "Incident auto-closed",
      });

      this.dropState(incidentId);
    });
  }

  // ── Internals ─────────────────────────────────────────────────────

  private reseedForRetry(state: RenderState, alert: AlertContext): void {
    state.status = "triggered";
    state.alert = alert;
    state.log = [];
    state.attachCount = 0;
    state.report = undefined;
    state.failure = undefined;
  }

  private scheduleFlush(incidentId: string): void {
    const existing = this.pending.get(incidentId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      void this.safe("flushNow", incidentId, () => this.flushNow(incidentId));
    }, DEBOUNCE_MS);
    this.pending.set(incidentId, { timer });
  }

  private cancelFlush(incidentId: string): void {
    const existing = this.pending.get(incidentId);
    if (existing) {
      clearTimeout(existing.timer);
      this.pending.delete(incidentId);
    }
  }

  private async flushNow(incidentId: string): Promise<void> {
    this.cancelFlush(incidentId);
    const state = this.states.get(incidentId);
    if (!state) return;
    await updateIncidentMessage({
      channel: state.channelId,
      ts: state.threadTs,
      blocks: buildIncidentMessageBlocks(state, incidentId),
      fallbackText: this.fallbackTextFor(state),
    });
  }

  private dropState(incidentId: string): void {
    this.states.delete(incidentId);
    this.cancelFlush(incidentId);
  }

  private async persistSnapshot(
    incidentId: string,
    state: RenderState,
  ): Promise<void> {
    const snapshot: IncidentRenderInputs = {
      status: state.status,
      alert: state.alert,
      log: state.log,
      attachCount: state.attachCount,
      report: state.report,
      failure: state.failure,
    };
    // Best-effort: the snapshot only backs cold-close rendering, so a failed
    // write must not block the primary flushNow render. On failure a later cold
    // close degrades to the legacy (no-snapshot) path.
    try {
      await this.incidents.persistLiveUpdateSnapshot(incidentId, snapshot);
    } catch (err) {
      console.error("SlackProgressReporter.persistSnapshot failed", {
        incidentId,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Re-renders the root message as closed so its Close button is gone. Warm
   * (in-memory state) re-renders from live state, keeping the full activity log.
   * Cold (reaper / post-restart) rebuilds from the persisted snapshot; legacy
   * incidents with no snapshot are left as last rendered since they never had a
   * Close button to remove.
   */
  private async rerenderClosed(
    incidentId: string,
    channelId: string,
    threadTs: string,
  ): Promise<void> {
    const state = this.states.get(incidentId);
    if (state) {
      state.status = "closed";
      await this.flushNow(incidentId);
      return;
    }

    const snapshot = await this.incidents.getLiveUpdateSnapshot(incidentId);
    if (!snapshot) return;

    const inputs: IncidentRenderInputs = {
      ...(snapshot as IncidentRenderInputs),
      status: "closed",
    };
    await updateIncidentMessage({
      channel: channelId,
      ts: threadTs,
      blocks: buildIncidentMessageBlocks(inputs, incidentId),
      fallbackText: this.fallbackTextFor(inputs),
    });
  }

  private fallbackTextFor(state: IncidentRenderInputs): string {
    const trigger = state.alert.triggerName;
    if (state.failure) return `Failed: ${trigger}`;
    if (state.report) return `Report ready: ${trigger}`;
    return `Investigating: ${trigger}`;
  }

  private async safe(
    method: string,
    incidentId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err: unknown) {
      console.error("SlackProgressReporter method failed", {
        method,
        incidentId,
        errorMessage: err instanceof Error ? err.message : String(err),
        errorStack: err instanceof Error ? err.stack : undefined,
      });
    }
  }
}

function findLastPendingIndex(
  log: ActivityLogEntry[],
  taskKey: string,
): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "delegationPending" && e.taskKey === taskKey) return i;
  }
  return -1;
}
