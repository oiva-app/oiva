import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isTerminal,
} from "../../../src/mastra/domain/incident-state";
import type { IncidentStatus } from "../../../src/mastra/ports/incident-repository";

describe("incident-state", () => {
  describe("canTransition — happy path lifecycle", () => {
    const lifecycle: [IncidentStatus, IncidentStatus][] = [
      ["triggered", "investigating"],
      ["investigating", "report_in_process"],
      ["report_in_process", "report_generated"],
      ["report_generated", "report_delivered"],
    ];
    it.each(lifecycle)("allows %s → %s", (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe("canTransition — closed is reachable from every non-terminal state", () => {
    const nonTerminal: IncidentStatus[] = [
      "triggered",
      "investigating",
      "report_in_process",
      "report_generated",
    ];
    it.each(nonTerminal)("allows %s → closed", (from) => {
      expect(canTransition(from, "closed")).toBe(true);
    });
  });

  describe("canTransition — illegal transitions", () => {
    it("rejects skipping a state (triggered → report_generated)", () => {
      expect(canTransition("triggered", "report_generated")).toBe(false);
    });
    it("rejects moving backwards (investigating → triggered)", () => {
      expect(canTransition("investigating", "triggered")).toBe(false);
    });
    it("rejects any transition out of a terminal state", () => {
      expect(canTransition("report_delivered", "closed")).toBe(false);
      expect(canTransition("closed", "investigating")).toBe(false);
    });
    it("rejects same-state transitions (triggered → triggered)", () => {
      expect(canTransition("triggered", "triggered")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("does not throw on a valid transition", () => {
      expect(() =>
        assertTransition("triggered", "investigating"),
      ).not.toThrow();
    });
    it("throws with a descriptive message on an invalid transition", () => {
      expect(() => assertTransition("triggered", "report_delivered")).toThrow(
        /Illegal incident state transition: triggered → report_delivered/,
      );
    });
    it("names the terminal state in the error when source is terminal", () => {
      expect(() => assertTransition("closed", "investigating")).toThrow(
        /none — terminal state/,
      );
    });
  });

  describe("isTerminal", () => {
    it("treats report_delivered and closed as terminal", () => {
      expect(isTerminal("report_delivered")).toBe(true);
      expect(isTerminal("closed")).toBe(true);
    });
    it("treats all other states as non-terminal", () => {
      expect(isTerminal("triggered")).toBe(false);
      expect(isTerminal("investigating")).toBe(false);
      expect(isTerminal("report_in_process")).toBe(false);
      expect(isTerminal("report_generated")).toBe(false);
    });
  });
});
