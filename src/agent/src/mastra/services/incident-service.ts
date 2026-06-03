/**
 * Incident lifecycle services.
 *
 * Application-layer operations that orchestrate the incident repository, the
 * progress reporter, and (for retry) a workflow re-dispatch. They live here
 * rather than on IncidentRepository because they have side effects beyond data
 * — reporting to Slack, starting a workflow run — and the repo stays a pure
 * data port.
 *
 * Both functions take their collaborators as explicit dependencies so they can
 * be exercised against fakes; the wiring layer (route handlers, the reaper)
 * binds the real singletons.
 */
import { assertTransition } from "../domain/incident-state";
import type { IncidentRepository } from "../ports/incident-repository";
import type { ClosedBy, ProgressReporter } from "../ports/progress-reporter";
import type { AlertContext } from "../types/alert-context";

export interface CloseIncidentDeps {
  incidents: IncidentRepository;
  reporter: ProgressReporter;
}

/**
 * Move an incident to `closed` and reflect it in Slack.
 *
 * Idempotent: a no-op if the incident is already closed (double-clicks, or the
 * reaper racing a human Close). Throws if the incident does not exist.
 *
 * Callers: the Close button handler (`{ kind: "user", userId }`) and the reaper
 * (`{ kind: "reaper" }`, which makes the reporter post a reply rather than edit
 * the root in place).
 */
export async function closeIncident(
  id: string,
  by: ClosedBy,
  deps: CloseIncidentDeps,
): Promise<void> {
  const { incidents, reporter } = deps;

  const incident = await incidents.findById(id);
  if (!incident) {
    throw new Error(`closeIncident: incident ${id} not found`);
  }
  if (incident.status === "closed") {
    return; // already closed — nothing to do
  }

  assertTransition(incident.status, "closed");
  await incidents.updateStatus(id, "closed");
  await reporter.incidentClosed(id, by);
}

export interface RetryIncidentDeps {
  incidents: IncidentRepository;
  /**
   * Rebuilds the AlertContext for a previously-investigated incident (e.g. from
   * the stored alert payload). Injected so this service stays decoupled from the
   * alert repository and the vendor normalize pipeline.
   */
  loadAlertContext: (incidentId: string) => Promise<AlertContext | null>;
  /** Re-dispatch the investigation workflow for the incident. */
  dispatch: (incidentId: string, alert: AlertContext) => Promise<void>;
}

/**
 * Re-run the investigation for a failed incident, on the same incident + thread.
 *
 * Only `failed` incidents are retryable; any other status is a no-op (stale
 * button, double-click, or a race with the reaper). Throws if the incident does
 * not exist or its alert context cannot be rebuilt.
 *
 * Does NOT transition status itself — the re-dispatched workflow's investigate
 * step performs `failed -> investigating`, keeping a single writer of status.
 * The workflow's announce step reuses the existing Slack thread (idempotent
 * `incidentOpened`), so retry continues the same message rather than posting a
 * new root.
 */
export async function retryIncident(
  id: string,
  deps: RetryIncidentDeps,
): Promise<void> {
  const { incidents, loadAlertContext, dispatch } = deps;

  const incident = await incidents.findById(id);
  if (!incident) {
    throw new Error(`retryIncident: incident ${id} not found`);
  }
  if (incident.status !== "failed") {
    return; // only failed incidents are retryable
  }

  const alert = await loadAlertContext(id);
  if (!alert) {
    throw new Error(`retryIncident: no alert context for incident ${id}`);
  }

  await dispatch(id, alert);
}
