import { describe, test, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { Tool } from "@mastra/core/tools";

import { investigationToolWrapper } from "@/tools/investigation-tool-wrapper";
import type { telemetryTraceSchema } from "@/types/investigation";

type InvestigationTrace = z.infer<typeof telemetryTraceSchema>;

// Mock functions

const innerInputSchema = z.object({ datasetId: z.string() });
const innerOutputSchema = z.object({ ok: z.boolean() });

function makeInnerTool(execute: Tool<any, any>["execute"]) {
  return {
    id: "fake_tool",
    description: "a fake tool used for testing",
    inputSchema: innerInputSchema,
    outputSchema: innerOutputSchema,
    execute,
  } as unknown as Tool<any, any>;
}

function makeContext(investigationTrace?: InvestigationTrace) {
  const store = new Map<string, unknown>();
  if (investigationTrace) store.set("investigationTrace", investigationTrace);

  const spanUpdate = vi.fn();
  return {
    context: {
      requestContext: {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => store.set(key, value),
      },
      tracingContext: { currentSpan: { update: spanUpdate } },
    },
    spanUpdate,
    getTrace: () =>
      store.get("investigationTrace") as InvestigationTrace | undefined,
  };
}

const validInput = { datasetId: "product_catalog", question: "why?" };

describe("investigationToolWrapper", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls the wrapped tool with the input minus 'question'", async () => {
    const innerExecute = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = investigationToolWrapper(makeInnerTool(innerExecute));
    const { context } = makeContext([]);

    const result = await wrapped.execute!(validInput, context as any);

    expect(result).toEqual({ ok: true });
    expect(innerExecute).toHaveBeenCalledTimes(1);
    // First arg is the tool input with the wrapper-only `question` stripped.
    expect(innerExecute.mock.calls[0][0]).toEqual({
      datasetId: "product_catalog",
    });
    expect(innerExecute.mock.calls[0][0]).not.toHaveProperty("question");
  });

  test("pushes a trace entry onto the requestContext trace on success", async () => {
    const innerExecute = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = investigationToolWrapper(makeInnerTool(innerExecute));
    const { context, getTrace } = makeContext([]);

    await wrapped.execute!(validInput, context as any);

    const trace = getTrace()!;
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      question: "why?",
      toolInput: { datasetId: "product_catalog" },
      toolOutput: { ok: true },
      queryUrl: "",
      error: false,
    });
  });

  test("records the error on the span and rethrows when the tool throws", async () => {
    const er = new Error("☹️");
    const innerExecute = vi.fn().mockRejectedValue(er);
    const wrapped = investigationToolWrapper(makeInnerTool(innerExecute));
    const { context, spanUpdate, getTrace } = makeContext([]);

    await expect(wrapped.execute!(validInput, context as any)).rejects.toThrow(
      "☹️",
    );

    expect(spanUpdate).toHaveBeenCalledWith({
      metadata: { error: true, "app.error": "☹️" },
    });

    expect(getTrace()).toHaveLength(0);
  });

  test("records the error and rethrows when the investigationTrace is missing/invalid", async () => {
    const innerExecute = vi.fn().mockResolvedValue({ ok: true });
    const wrapped = investigationToolWrapper(makeInnerTool(innerExecute));
    const { context, spanUpdate } = makeContext(); // no investigationTrace

    // telemetryTraceSchema.parse(undefined) throws a ZodError before the tool runs.
    await expect(
      wrapped.execute!(validInput, context as any),
    ).rejects.toThrow();

    expect(innerExecute).not.toHaveBeenCalled();
    expect(spanUpdate).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        error: true,
        "app.error": expect.any(String),
      }),
    });
  });
});
