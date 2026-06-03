import { describe, it, expect } from "vitest";
import { correlate } from "../../../src/mastra/domain/correlation";
import type { Incident } from "../../../src/mastra/ports/incident-repository";

const incident = (id: string): Incident => ({
  id,
  status: "investigating",
  createdAt: new Date("2026-05-22T00:00:00Z"),
  statusUpdated: new Date("2026-05-22T00:00:00Z"),
  resolvedAt: null,
  slackThreadTs: null,
  slackChannelId: null,
});

describe("correlate", () => {
  it("returns 'new' with count 0 when there are no candidates", () => {
    expect(correlate([])).toEqual({ kind: "new", candidateCount: 0 });
  });

  it("matches the first candidate when one exists", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(correlate([incident(id)])).toEqual({
      kind: "match",
      incidentId: id,
      candidateCount: 1,
    });
  });

  it("matches the first candidate and reports the full count when several exist", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const result = correlate([
      incident(first),
      incident("22222222-2222-4222-8222-222222222222"),
      incident("33333333-3333-4333-8333-333333333333"),
    ]);
    expect(result).toEqual({
      kind: "match",
      incidentId: first,
      candidateCount: 3,
    });
  });
  it("does not mutate the input array", () => {
    const candidates = [incident("11111111-1111-4111-8111-111111111111")];
    const copy = [...candidates];
    correlate(candidates);
    expect(candidates).toEqual(copy);
  });
});
