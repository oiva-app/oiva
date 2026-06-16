import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isTerminal,
} from "../../../src/mastra/domain/incident-state";
import type { IncidentStatus } from "@/domain/incident";

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

  describe("canTransition — closed is reachable from every other state", () => {
    const nonClosed: IncidentStatus[] = [
      "triggered",
      "investigating",
      "report_in_process",
      "report_generated",
      "report_delivered",
      "failed",
    ];
    it.each(nonClosed)("allows %s → closed", (from) => {
      expect(canTransition(from, "closed")).toBe(true);
    });
  });

  describe("canTransition — failure is reachable from every working state", () => {
    const workingStates: IncidentStatus[] = [
      "triggered",
      "investigating",
      "report_in_process",
      "report_generated",
    ];
    it.each(workingStates)("allows %s → failed", (from) => {
      expect(canTransition(from, "failed")).toBe(true);
    });

    it("rejects report_delivered → failed (a delivered report can't fail)", () => {
      expect(canTransition("report_delivered", "failed")).toBe(false);
    });
  });

  describe("canTransition — failed recovery", () => {
    it("allows failed → investigating (retry)", () => {
      expect(canTransition("failed", "investigating")).toBe(true);
    });
    it("allows failed → closed (give up / reaper)", () => {
      expect(canTransition("failed", "closed")).toBe(true);
    });
    it("rejects failed jumping back into the middle of the pipeline", () => {
      expect(canTransition("failed", "report_in_process")).toBe(false);
      expect(canTransition("failed", "report_delivered")).toBe(false);
    });
  });

  describe("canTransition — report_delivered", () => {
    it("allows report_delivered → closed (Close button)", () => {
      expect(canTransition("report_delivered", "closed")).toBe(true);
    });
    it("allows no other transition out of report_delivered", () => {
      expect(canTransition("report_delivered", "investigating")).toBe(false);
      expect(canTransition("report_delivered", "failed")).toBe(false);
    });
  });

  describe("canTransition — illegal transitions", () => {
    it("rejects skipping a state (triggered → report_generated)", () => {
      expect(canTransition("triggered", "report_generated")).toBe(false);
    });
    it("rejects moving backwards (investigating → triggered)", () => {
      expect(canTransition("investigating", "triggered")).toBe(false);
    });
    it("rejects any transition out of closed (the only terminal state)", () => {
      expect(canTransition("closed", "investigating")).toBe(false);
      expect(canTransition("closed", "failed")).toBe(false);
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
    it("treats closed as the only terminal state", () => {
      expect(isTerminal("closed")).toBe(true);
    });
    it("treats all other states (incl. report_delivered and failed) as non-terminal", () => {
      expect(isTerminal("triggered")).toBe(false);
      expect(isTerminal("investigating")).toBe(false);
      expect(isTerminal("report_in_process")).toBe(false);
      expect(isTerminal("report_generated")).toBe(false);
      expect(isTerminal("report_delivered")).toBe(false);
      expect(isTerminal("failed")).toBe(false);
    });
  });
});
