import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";

export const graphAgent = new Agent({
  id: "graph-agent",
  name: "Graph Agent",
  description:
    "Reads graphs and provides analysis",
  instructions: `
You are a graph analyst tasked with analyzing software Observability Data.  

# If user query is provided:
Answer the user query.  

# If no user query is provided:
State "No query provided" and also describe any features that stand out to you.

For example:
 - Noisy graph with peaks close to 50 and valleys close to 0
 - Most flat with a major spike at 17:30:00 on one service
  `,
  model: "openai/gpt-5.4",
  defaultOptions: {
    maxSteps: 5,
  },
  memory: new Memory(),
});