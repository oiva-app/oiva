import { alertContextSchema } from "@/types/alert-context";
import { createTool } from "@mastra/core/tools";
import { TracingContext } from "@mastra/core/observability";
import { z } from "zod"
import { mastra } from "..";


export const enrichAlertTool = createTool({
  id: "enrich-alert-tool",
  description: "Retrieve an enriched alert including description, key timestamps, alert query results",
  inputSchema: z.object({}),
  outputSchema: z.string(),
  requestContextSchema: z.object({
    alertContext: alertContextSchema,
  })
  execute: async (inputData, context) => {

    const alertContext = context.requestContext?.get("alertContext")
    try {
      if (!alertContext) throw new Error("Missing alertContext")
      const workflow = mastra.getWorkflow("alertEnrich")
      const run = await workflow.createRun()
      const result = await run.start( {inputData: { alertContext }})
      return result
    } catch (e) {
      context?.tracingContext?.currentSpan?.update({
        metadata: {
          error: true,
          "app.alertContext": JSON.stringify(alertContext),
        }
      })
    }
    return "ERROR"
  }
})