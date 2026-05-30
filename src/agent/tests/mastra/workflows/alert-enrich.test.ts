import { z } from "zod"
import { describe, test, expect } from "vitest";
import { lisaExpected } from "../../fixtures/sample_alerts/lisa-normalized";
import { workflowStateSchema } from "@/workflows/alert-enrich";
import { mastra } from "@/index";

const workflowState = {
  alertContext: lisaExpected
}

const workflow = mastra.getWorkflow("alertEnrich");

// import {}

test("workflowState (mock) validates against Workflow schema", () => {
  const result = workflowStateSchema.safeParse(workflowState)
  expect(result.success).toBe(true)
})

// test("workflow runs without error", async () => {
//   const run = await workflow.createRun();
//   const result = await run.start({ inputData: workflowState })
// })