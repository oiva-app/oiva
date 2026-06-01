import { describe, it, expect } from "vitest";
import {
  incidentDurationMs,
  formatDuration,
} from "../../../src/mastra/domain/incident-duration";

describe("incidentDurationMs", () => {
  it("computes the elapsed milliseconds between two dates", () => {
    const start = new Date("2026-05-22T00:00:00Z");
    const end = new Date("2026-05-22T01:23:45Z");
    expect(incidentDurationMs(start, end)).toBe((3600 + 23 * 60 + 45) * 1000);
  });

  it("returns 0 for identical timestamps", () => {
    const ts = new Date("2026-05-22T00:00:00Z");
    expect(incidentDurationMs(ts, ts)).toBe(0);
  });

  it("clamps to 0 when end precedes start (no negative durations)", () => {
    const start = new Date("2026-05-22T01:00:00Z");
    const end = new Date("2026-05-22T00:00:00Z");
    expect(incidentDurationMs(start, end)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration((3600 + 23 * 60 + 45) * 1000)).toBe("1h 23m 45s");
  });
  it("omits zero-valued leading units", () => {
    expect(formatDuration((5 * 60 + 9) * 1000)).toBe("5m 9s");
    expect(formatDuration(42 * 1000)).toBe("42s");
  });
  it("renders 0s for sub-second and zero durations", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(400)).toBe("0s");
  });
  it("rounds to the nearest second", () => {
    expect(formatDuration(1500)).toBe("2s");
  });
  it("keeps an interior zero minute when hours and seconds are present", () => {
    expect(formatDuration((3600 + 7) * 1000)).toBe("1h 7s");
  });
});
