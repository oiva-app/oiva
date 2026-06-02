import { describe, test, expect } from "vitest";
import { lisaExpected } from "../../fixtures/sample_alerts/lisa-normalized";
import { workflowStateSchema } from "@/workflows/alert-enrich";
import { honeycomb_get_workspace_context } from "@/mcp/mcpClients";
import { mastra } from "@/index";
import { env } from "@/config/env";

const workflowState = {
  alertContext: lisaExpected,
};

const workflow = mastra.getWorkflow("alertEnrich");

test("workflowState (mock) validates against Workflow schema", () => {
  const result = workflowStateSchema.safeParse(workflowState);
  expect(result.success).toBe(true);
});

/**
TROUBLESHOOTING
- UNEXPIRED QUERY RESULTS? Do the imported alerts point to real query results?  Visit the query URL using your browser to verify
- CORRECT TEAM? Does the HC MCP Key (in .env) point to the HC Team that contains the query URL that you just visited?
 */
describe.runIf(env.RUN_OIVA_SV_MCP_INTEGRATION_TESTS)("MCP Integration tests", () => {
  /*
  We use get_workspace_context because it requires no required args
  */
  test("MCP connection is functioning and .env contains valid MCP key", async () => {
    if (honeycomb_get_workspace_context?.execute) {
      const result = await honeycomb_get_workspace_context.execute({}, {});
      expect(result.isError).toBeFalsy();
    }
    else throw new Error("HC MCP connection failed")
  });

  test("Workflow runs without error", async () => {
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: workflowState,
      initialState: workflowState,
    });
    expect(result.status).toBe("success");
  });
});