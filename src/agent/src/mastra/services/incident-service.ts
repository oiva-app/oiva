import { canTransition } from "@/domain/incident-state";
import type { IncidentRepository } from "@/ports/incident-repository";
import type { ClosedBy, ProgressReporter } from "@/ports/progress-reporter";
import type { AlertContext } from "@/domain/alert-context";

export interface CloseIncidentDeps {
  incidents: IncidentRepository;
  reporter: ProgressReporter;
}

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

  const didClose = await incidents.closeIfOpen(id);
  if (didClose) {
    await reporter.incidentClosed(id, by);
  }
}

export interface RetryIncidentDeps {
  incidents: IncidentRepository;
  //Rebuilds the AlertContext for a previously-investigated incident
  loadAlertContext: (incidentId: string) => Promise<AlertContext | null>;
  // Re-dispatch the investigation workflow for the incident.
  dispatch: (incidentId: string, alert: AlertContext) => Promise<void>;
}

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

export interface FailIncidentDeps {
  incidents: IncidentRepository;
  reporter: ProgressReporter;
}

export async function failIncident(
  id: string,
  reason: string,
  deps: FailIncidentDeps,
): Promise<void> {
  const { incidents, reporter } = deps;

  const incident = await incidents.findById(id);
  if (!incident) {
    return;
  }
  if (!canTransition(incident.status, "failed")) {
    return;
  }

  await incidents.updateStatus(id, "failed");
  await reporter.incidentFailed(id, { reason });
}
