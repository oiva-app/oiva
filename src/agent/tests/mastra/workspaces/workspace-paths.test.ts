import { describe, it, expect } from "vitest";
import path from "node:path";
import { getContainedClonePath } from "../../../src/mastra/workspaces/workspace-paths";

const ROOT = "/tmp/workspaces/incident-unit/codebase";

describe("getContainedClonePath", () => {
  it("returns the contained clone path for a normal repo name", () => {
    expect(getContainedClonePath(ROOT, "orders-api")).toBe(
      path.resolve(path.join(ROOT, "orders-api")),
    );
  });

  it("allows a nested but still-contained repo path", () => {
    expect(getContainedClonePath(ROOT, "team/orders-api")).toBe(
      path.resolve(path.join(ROOT, "team", "orders-api")),
    );
  });

  it.each([
    "..",
    "../sibling",
    "../../etc",
    "orders-api/../../escape",
    ".",
    "",
  ])("throws when the repo name escapes the codebase root: %j", (name) => {
    expect(() => getContainedClonePath(ROOT, name)).toThrow(
      `Repository name escapes codebase root: ${name}`,
    );
  });
});
