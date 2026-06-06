/**
 * Cleanup reaper — drains parked and stuck incidents toward `closed`.
 *
 * Single-shot sweep (the scheduler decides cadence). Three sweeps, all keyed
 * off `status_updated_at` via IncidentRepository.findStaleIncidents:
 *
 *   1. report_delivered + quiet      → closed  (investigation done; tidy up)
 *   2. failed + quiet                → closed  (un-retried, un-acked; give up)
 *   3. working state + past deadline → failed  (the run died or hung)
 */
import type {
  IncidentRepository,
  IncidentStatus,
} from "../ports/incident-repository";
import type { ProgressReporter } from "../ports/progress-reporter";
import { closeIncident, failIncident } from "./incident-service";

const STUCK_STATUSES: readonly IncidentStatus[] = [
  "triggered",
  "investigating",
  "report_in_process",
  "report_generated",
];

export interface ReaperThresholds {
  deliveredQuietMs: number;
  failedQuietMs: number;
  stuckDeadlineMs: number;
}

export interface ReapDeps {
  incidents: IncidentRepository;
  reporter: ProgressReporter;
  thresholds: ReaperThresholds;
  /** Injected clock; defaults to wall-clock. Override in tests. */
  now?: () => Date;
}

export interface ReapSummary {
  deliveredClosed: string[];
  failedClosed: string[];
  stuckFailed: string[];
  errors: { incidentId: string; sweep: string; reason: string }[];
}

export async function reapStaleIncidents(deps: ReapDeps): Promise<ReapSummary> {
  const { incidents, reporter, thresholds } = deps;
  const t = (deps.now ?? (() => new Date()))().getTime();
  const cutoff = (ms: number) => new Date(t - ms);
  const summary: ReapSummary = {
    deliveredClosed: [],
    failedClosed: [],
    stuckFailed: [],
    errors: [],
  };

  async function closeQuiet(
    status: IncidentStatus,
    quietMs: number,
    sink: string[],
  ): Promise<void> {
    const stale = await incidents.findStaleIncidents({
      statuses: [status],
      updatedBefore: cutoff(quietMs),
    });
    for (const incident of stale) {
      try {
        await closeIncident(
          incident.id,
          { kind: "reaper" },
          { incidents, reporter },
        );
        sink.push(incident.id);
      } catch (err) {
        summary.errors.push({
          incidentId: incident.id,
          sweep: status,
          reason: reasonOf(err),
        });
      }
    }
  }

  await closeQuiet(
    "report_delivered",
    thresholds.deliveredQuietMs,
    summary.deliveredClosed,
  );
  await closeQuiet("failed", thresholds.failedQuietMs, summary.failedClosed);

  const stuck = await incidents.findStaleIncidents({
    statuses: [...STUCK_STATUSES],
    updatedBefore: cutoff(thresholds.stuckDeadlineMs),
  });
  for (const incident of stuck) {
    try {
      await failIncident(
        incident.id,
        `reaper: stuck in ${incident.status} past deadline`,
        { incidents, reporter },
      );
      summary.stuckFailed.push(incident.id);
    } catch (err) {
      summary.errors.push({
        incidentId: incident.id,
        sweep: "stuck",
        reason: reasonOf(err),
      });
    }
  }

  return summary;
}

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
