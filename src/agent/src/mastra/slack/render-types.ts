import type { AlertContext } from "../types/alert-context";
import type { IncidentReport } from "../types/report";
import type { IncidentStatus } from "../ports/incident-repository";
import type { ClosedBy } from "../ports/progress-reporter";

export type ActivityLogEntry =
  | { kind: "milestone"; label: string }
  | { kind: "delegationPending"; taskKey: string }
  | {
      kind: "delegationCompleted";
      taskKey: string;
      durationMs: number;
      success: boolean;
      headline?: string;
    };

export interface IncidentRenderInputs {
  status: IncidentStatus;
  alert: AlertContext;
  log: ReadonlyArray<ActivityLogEntry>;
  attachCount: number;
  report?: { report: IncidentReport; resultUrl: string };
  failure?: { reason: string };
  closedBy?: ClosedBy;
}
