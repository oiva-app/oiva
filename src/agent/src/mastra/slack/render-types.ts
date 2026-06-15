import type { AlertContext } from "@/domain/alert-context";
import type { IncidentReport } from "@/domain/incident-report";
import type { IncidentStatus } from "@/domain/incident";

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
}
