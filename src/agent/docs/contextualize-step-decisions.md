# Contextualize step: translation vs augmentation

Bringing this back from our last meeting for team discussion.

## The proposal

Add a `contextualizeStep` after `normalizeStep` that makes an LLM call to generate a textual
description of the alert. The investigation step would receive both the `AlertContext` and the description.

## The question we need to decide

Is the step doing **translation** (structured => prose) or **augmentation** (gathering external signal the investigation agent doesn't already have)?

## Option A: Pure translation (`AlertContext` => English prose)

**Concern:** the investigation step is itself an LLM agent. LLMs read structured JSON fine —
they don't need prose to reason about an alert. A translation-only step costs:

- An extra LLM round trip (latency)
- Money per investigation
- Determinism (same input => slightly different prose, complicates testing)

…to produce something the investigation agent could derive from the structured input directly.

If we want a textual rendering for **human eyes** (final report intro, Slack message), that's an _output_-time concern, not a between-normalize-and-investigate concern.

## Option B: Augmentation (gather signal the agent doesn't already have)

Examples of what augmentation could do:

- Pull recent deploys to the affected service
- Surface related alerts firing concurrently
- Check the trigger's recent firing history (detect noisy-trigger patterns?)
- Lightweight classification
- Memory recall: similar prior incidents and what was concluded

The output changes **what the agent investigates next**, not just rephrases what it already has.

## My read

- I'd argue for skipping the **translation** step entirely and letting the investigation agent reason from `AlertContext` directly.
- **Augmentation** seems like the better option, but we should plan the output schema
  with the richer shape in mind from day one.

## Decisions to make if we include this step in the workflow

1. **Translation or augmentation?** (the main question)
2. **What goes into the enriched context long-term?** Anticipate the richer shape now even if we implement a minimal version first.
3. **Failure handling.** If the contextualizer LLM times out or rate-limits, does the workflow
   bail, or pass through with empty enrichment so investigation can still happen with only the alertContext?

## Implementation sketch

```ts
// types/enriched-context.ts (new)
export const EnrichedContextSchema = z.object({
  alertContext: AlertContextSchema,
  description: z.string().optional(),
  signals: z.array(SignalSchema).optional(), //see decision #2
});
export type EnrichedContext = z.infer<typeof EnrichedContextSchema>;

// workflows/oiva-workflow.ts
const contextualizeStep = createStep({
  id: "contextualize-alert",
  description:
    "Enrich the normalized alert with signals the investigation agent needs.",
  inputSchema: AlertContextSchema,
  outputSchema: EnrichedContextSchema,
  execute: async ({ inputData, mastra }) => {
    const contextualizerAgent = mastra.getAgent("contextualizer-agent");

    const description = await contextualizerAgent.generate({
      prompt: renderContextualizePrompt(inputData), //implementation TBD
    });
    return { alertContext: inputData, description: description.text };
  },
});

oivaWorkflow
  .then(verifyStep)
  .map(/* existing guard */)
  .then(normalizeStep)
  .then(contextualizeStep)
  .then(investigateStep) // takes EnrichedContext object
  .commit();
```
