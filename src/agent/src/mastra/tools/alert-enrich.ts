import { alertContextSchema } from "@/types/alert-context";
import { createTool } from "@mastra/core/tools";
import { z } from "zod"


export const enrichAlertTool = createTool({
  id: "enrich-alert-tool",
  description: "Retrieve an enriched alert including description, key timestamps, alert query results",
  inputSchema: z.object({}),
  outputSchema: z.string(),
  requestContextSchema: z.object({
    alertContext: alertContextSchema,
  }),
  execute: async (_inputData, context) => {
    let result;
    const alertContext = context.requestContext?.get("alertContext")
    try {
      if (!alertContext) throw new Error("Missing alertContext")
      const workflow = context.mastra!.getWorkflow("alertEnrich")
      const run = await workflow.createRun()
      result = await run.start( {inputData: { alertContext }})

      if (result.status !== "success") {
        throw new Error(`alertEnrich run ${result.status}`);
      }

      return result.result;
    } catch (e) {
      context?.tracingContext?.currentSpan?.update({
        metadata: {
          error: true,
          "app.error": e instanceof Error ? e.message : String(e),
          "app.alertContext": JSON.stringify(alertContext),
          "app.workflowResult": JSON.stringify(result)
        }
      })
      return "ERROR"
    }
  }
})