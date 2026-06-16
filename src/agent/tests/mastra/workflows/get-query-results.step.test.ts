import { describe, test, expect, vi } from "vitest";
import { createWorkflow } from "@mastra/core/workflows";
import { alertContextSchema } from "@/domain/alert-context";
import { lisaExpected } from "../../fixtures/sample_alerts/lisa-normalized";

// Replace the live MCP client with the captured tool output so the step runs
// offline and deterministically. The factory uses require() because vi.mock is
// hoisted above the imports.
vi.mock("@/mcp/mcpClients", () => {
  const queryResults = require("../../fixtures/sample_alerts/lisa-query-results.json");
  return {
    honeycomb_get_query_results: {
      execute: vi.fn().mockResolvedValue(queryResults),
    },
    mcpClient: { resources: { read: vi.fn() } },
  };
});

// Imported after the mock is registered.
const { getQueryResults, workflowStateSchema } = await import(
  "@/workflows/alert-enrich"
);

describe("getQueryResults step (isolated)", () => {
  const onlyGetQueryResults = createWorkflow({
    id: "test-get-query-results",
    inputSchema: alertContextSchema,
    outputSchema: getQueryResults.outputSchema,
    stateSchema: workflowStateSchema,
  })
    .then(getQueryResults)
    .commit();

  test("returns the MCP query-results envelope", async () => {
    const run = await onlyGetQueryResults.createRun();
    const result = await run.start({
      inputData: lisaExpected,
      initialState: { alertContext: lisaExpected },
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return; // narrows the union for TS
    const jsonLink = result.result.content.find(
      (c) => c.type === "resource_link" && c.mimeType === "application/json",
    );
    expect(jsonLink).toBeDefined();
  });
});
