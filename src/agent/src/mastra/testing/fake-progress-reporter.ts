/**
 * FakeProgressReporter — in-memory test double for the ProgressReporter port.
 *
 * Records every call so tests can assert *what* the system reported without a
 * live Slack connection. Both sides of the build use it: the workflow, the
 * delegation hooks, the close/retry service, and the reaper are tested by
 * asserting against the recorded events; the real SlackProgressReporter is
 * tested separately against the Slack API contract.
 */
import type {
  ClosedBy,
  DelegationOutcome,
  ProgressReporter,
} from "../ports/progress-reporter";
import type { AlertContext } from "../types/alert-context";
import type { IncidentReport } from "../types/report";
import type { IncidentStatus } from "../ports/incident-repository";

export type ProgressEvent =
  | { type: "incidentOpened"; incidentId: string; alert: AlertContext }
  | { type: "statusChanged"; incidentId: string; status: IncidentStatus }
  | { type: "milestone"; incidentId: string; label: string }
  | { type: "delegationStarted"; incidentId: string; taskKey: string }
  | {
      type: "delegationCompleted";
      incidentId: string;
      taskKey: string;
      outcome: DelegationOutcome;
    }
  | { type: "alertAttached"; incidentId: string }
  | {
      type: "reportReady";
      incidentId: string;
      report: IncidentReport;
      resultUrl: string;
    }
  | { type: "attachReportFile"; incidentId: string; report: IncidentReport }
  | { type: "incidentFailed"; incidentId: string; failure: { reason: string } }
  | { type: "incidentClosed"; incidentId: string; by: ClosedBy };

export class FakeProgressReporter implements ProgressReporter {
  /** Every recorded call, in order. */
  readonly events: ProgressEvent[] = [];

  /** All events for one incident, in order. */
  eventsFor(incidentId: string): ProgressEvent[] {
    return this.events.filter((e) => e.incidentId === incidentId);
  }

  /** Events of a given type, narrowed to that variant. */
  ofType<T extends ProgressEvent["type"]>(
    type: T,
  ): Extract<ProgressEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<
      ProgressEvent,
      { type: T }
    >[];
  }

  /** Clear recorded events between tests. */
  reset(): void {
    this.events.length = 0;
  }

  async incidentOpened(incidentId: string, alert: AlertContext): Promise<void> {
    this.events.push({ type: "incidentOpened", incidentId, alert });
  }

  async statusChanged(
    incidentId: string,
    status: IncidentStatus,
  ): Promise<void> {
    this.events.push({ type: "statusChanged", incidentId, status });
  }

  async milestone(incidentId: string, label: string): Promise<void> {
    this.events.push({ type: "milestone", incidentId, label });
  }

  async delegationStarted(incidentId: string, taskKey: string): Promise<void> {
    this.events.push({ type: "delegationStarted", incidentId, taskKey });
  }

  async delegationCompleted(
    incidentId: string,
    taskKey: string,
    outcome: DelegationOutcome,
  ): Promise<void> {
    this.events.push({
      type: "delegationCompleted",
      incidentId,
      taskKey,
      outcome,
    });
  }

  async alertAttached(incidentId: string): Promise<void> {
    this.events.push({ type: "alertAttached", incidentId });
  }

  async reportReady(
    incidentId: string,
    report: IncidentReport,
    resultUrl: string,
  ): Promise<void> {
    this.events.push({ type: "reportReady", incidentId, report, resultUrl });
  }

  async attachReportFile(
    incidentId: string,
    report: IncidentReport,
  ): Promise<void> {
    this.events.push({ type: "attachReportFile", incidentId, report });
  }

  async incidentFailed(
    incidentId: string,
    failure: { reason: string },
  ): Promise<void> {
    this.events.push({ type: "incidentFailed", incidentId, failure });
  }

  async incidentClosed(incidentId: string, by: ClosedBy): Promise<void> {
    this.events.push({ type: "incidentClosed", incidentId, by });
  }
}
