import { describe, it, expect } from "vitest";
import {
  threadIdForIncident,
  incidentIdFromThreadId,
} from "@/domain/incident-thread";

describe("incident-thread", () => {
  it("round-trips an incident id", () => {
    expect(incidentIdFromThreadId(threadIdForIncident("abc-123"))).toBe(
      "abc-123",
    );
  });
  it("returns null for a non-incident thread", () => {
    expect(incidentIdFromThreadId("weather:abc")).toBeNull();
  });
  it("returns null for undefined", () => {
    expect(incidentIdFromThreadId(undefined)).toBeNull();
  });
});
