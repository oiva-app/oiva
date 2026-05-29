/**
 * Incident state machine — pure domain logic.
 *
 * Codifies the transition rules of the 6-state incident lifecycle:
 *
 *   triggered → investigating → report_in_process → report_generated
 *             → report_delivered  (terminal: report sent to Slack)
 *
 *   closed  (terminal: can be entered from any non-terminal state as a
 *            cancellation/abandon path)
 */

import type { IncidentStatus } from "../ports/incident-repository";

const VALID_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  triggered: ["investigating", "closed"],
  investigating: ["report_in_process", "closed"],
  report_in_process: ["report_generated", "closed"],
  report_generated: ["report_delivered", "closed"],
  report_delivered: [],
  closed: [],
};

export function canTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Illegal incident state transition: ${from} → ${to}. ` +
        `Valid transitions from ${from}: [${
          VALID_TRANSITIONS[from].join(", ") || "(none — terminal state)"
        }].`,
    );
  }
}

export function isTerminal(status: IncidentStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}
