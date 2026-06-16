/**
 * Correlation decision — pure domain logic.
 *
 * Given the list of candidate incidents returned by
 * IncidentRepository.findActiveCandidates (already filtered to a matching
 * correlation tuple and time window, status non-terminal), decide whether
 * the incoming alert correlates to one of them or whether a new incident
 * is needed.
 */

import * as z from "zod";
import type { Incident } from "./incident";

export const CorrelationResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("match"),
    incidentId: z.string().uuid(),
    candidateCount: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("new"),
    candidateCount: z.literal(0),
  }),
]);
export type CorrelationResult = z.infer<typeof CorrelationResultSchema>;

export function correlate(candidates: readonly Incident[]): CorrelationResult {
  if (candidates.length === 0) {
    return { kind: "new", candidateCount: 0 };
  }
  return {
    kind: "match",
    incidentId: candidates[0].id,
    candidateCount: candidates.length,
  };
}
