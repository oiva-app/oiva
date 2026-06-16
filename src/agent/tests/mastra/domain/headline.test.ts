import { describe, it, expect } from "vitest";
import { parseHeadline } from "@/domain/headline";

describe("parseHeadline", () => {
  it("extracts an explicit HEADLINE: line", () => {
    expect(
      parseHeadline("HEADLINE: Pool exhaustion after deploy\n\nSummary: ..."),
    ).toBe("Pool exhaustion after deploy");
  });
  it("is case-insensitive and trims", () => {
    expect(parseHeadline("  headline:   spaced out  \nrest")).toBe(
      "spaced out",
    );
  });
  it("finds HEADLINE: even when not the first line", () => {
    expect(parseHeadline("Verdict: problem_found\nHEADLINE: the thing\n")).toBe(
      "the thing",
    );
  });
  it("falls back to the first non-empty line", () => {
    expect(parseHeadline("\n\nFirst real line\nSecond")).toBe(
      "First real line",
    );
  });
  it("returns undefined for empty / whitespace / undefined", () => {
    expect(parseHeadline("")).toBeUndefined();
    expect(parseHeadline("   \n  \n")).toBeUndefined();
    expect(parseHeadline(undefined)).toBeUndefined();
  });
  it("truncates over-length headlines with an ellipsis", () => {
    const out = parseHeadline(`HEADLINE: ${"x".repeat(200)}`)!;
    expect(out.length).toBe(140);
    expect(out.endsWith("…")).toBe(true);
  });
});
