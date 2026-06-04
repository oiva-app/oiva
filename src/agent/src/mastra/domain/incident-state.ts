/**
 * Incident state machine — pure domain logic.
 *
 * Codifies the transition rules of the 7-state incident lifecycle:
 *
 *   triggered → investigating → report_in_process → report_generated
 *             → report_delivered → closed
 *
 *   failed  (investigation or report generation failed; reachable from any
 *            working state. Retryable via failed → investigating, or drained
 *            to closed by a human or the reaper. Excluded from correlation.)
 *
 *   closed  (the only terminal state; reachable from any non-terminal state as
 *            a cancel/abandon/acknowledge path, including report_delivered and
 *            failed.)
 */

import type { IncidentStatus } from "../ports/incident-repository";

const VALID_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  triggered: ["investigating", "failed", "closed"],
  investigating: ["report_in_process", "failed", "closed"],
  report_in_process: ["report_generated", "failed", "closed"],
  report_generated: ["report_delivered", "failed", "closed"],
  report_delivered: ["closed"],
  failed: ["investigating", "closed"],
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
