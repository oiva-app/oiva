import type { Mastra } from "@mastra/core/mastra";
import { closeIncident, retryIncident } from "../services/incident-service";
import { incidentRepository, alertRepository } from "../repositories";
import { progressReporter } from "../slack";
import { normalizeAlert } from "../adapters/honeycomb-adapter";
import { honeycombWebhookPayloadSchema } from "../types/honeycomb-alert";
import type { AlertContext } from "../types/alert-context";

export async function handleIncidentClose(
  incidentId: string,
  userId: string,
): Promise<void> {
  await closeIncident(
    incidentId,
    { kind: "user", userId },
    { incidents: incidentRepository, reporter: progressReporter },
  );
}

export async function handleIncidentRetry(
  incidentId: string,
  mastra: Mastra,
): Promise<void> {
  await retryIncident(incidentId, {
    incidents: incidentRepository,
    loadAlertContext,
    dispatch: (id, alert) => dispatchInvestigation(mastra, id, alert),
  });
}

export async function loadAlertContext(
  incidentId: string,
): Promise<AlertContext | null> {
  const alert = await alertRepository.findFirstByIncident(incidentId);
  if (!alert) return null;

  const parsed = honeycombWebhookPayloadSchema.safeParse(alert.rawPayload);
  if (!parsed.success) {
    console.error("loadAlertContext: stored payload failed schema parse", {
      incidentId,
    });
    return null;
  }
  return normalizeAlert(parsed.data);
}

/** Fire-and-forget, same pattern as the alert hook handler. */
async function dispatchInvestigation(
  mastra: Mastra,
  incidentId: string,
  alertContext: AlertContext,
): Promise<void> {
  const run = await mastra.getWorkflow("oivaWorkflow").createRun();
  void run
    .start({ inputData: { incidentId, alertContext } })
    .catch((err: unknown) => {
      mastra.getLogger().error("retry workflow run failed", {
        runId: run.runId,
        incidentId,
        err,
      });
    });
}
