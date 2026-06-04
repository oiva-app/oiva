import { describe, test, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { Tool } from "@mastra/core/tools";

import { investigationToolWrapper } from "@/tools/investigation-tool-wrapper";
import type { investigationTraceSchema } from "@/types/investigation";

type InvestigationTrace = z.infer<typeof investigationTraceSchema>;

const innerInputSchema = z.object({ datasetId: z.string() });
const innerOutputSchema = z.object({ ok: z.boolean() });

const validInput = { datasetId: "product_catalog", question: "why?" };

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
  const childEnd = vi.fn();
  const childError = vi.fn();
  const createChildSpan = vi.fn(() => ({ end: childEnd, error: childError }));

  return {
    context: {
      requestContext: {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => store.set(key, value),
      },
      tracingContext: { currentSpan: { update: spanUpdate, createChildSpan } },
    },
    spanUpdate,
    childEnd,
    childError,
    getTrace: () =>
      store.get("investigationTrace") as InvestigationTrace | undefined,
  };
}

// Wrap a tool, point it at a fresh mock context, and return a ready-to-call
// `run()` plus the spies so each test is just its scenario and assertions.
function setup(opts: { trace?: InvestigationTrace; error?: Error } = {}) {
  const innerExecute = opts.error
    ? vi.fn().mockRejectedValue(opts.error)
    : vi.fn().mockResolvedValue({ ok: true });
  const wrapped = investigationToolWrapper(makeInnerTool(innerExecute));
  const ctx = makeContext(opts.trace);
  const run = () => wrapped.execute!(validInput, ctx.context as any);
  return { innerExecute, run, ...ctx };
}

describe("investigationToolWrapper", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls the wrapped tool with the input minus 'question'", async () => {
    const { innerExecute, run } = setup({ trace: [] });

    const result = await run();

    expect(result).toEqual({ ok: true });
    expect(innerExecute).toHaveBeenCalledTimes(1);
    // The wrapper-only `question` is stripped before the real tool runs.
    expect(innerExecute.mock.calls[0][0]).toEqual({
      datasetId: "product_catalog",
    });
  });

  test("pushes a trace entry onto the requestContext trace on success", async () => {
    const { run, getTrace } = setup({ trace: [] });

    await run();

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

  test("records the error and rethrows when the tool throws", async () => {
    const { run, spanUpdate, childError, getTrace } = setup({
      trace: [],
      error: new Error("☹️"),
    });

    await expect(run()).rejects.toThrow("☹️");

    expect(childError).toHaveBeenCalled();
    expect(spanUpdate).toHaveBeenCalledWith({
      metadata: { error: true, "app.error": "☹️" },
    });
    expect(getTrace()).toHaveLength(0);
  });

  test("starts a fresh trace when none exists in requestContext", async () => {
    const { innerExecute, run, getTrace } = setup(); // no investigationTrace

    await run();

    expect(innerExecute).toHaveBeenCalledTimes(1);
    expect(getTrace()).toHaveLength(1);
  });

  test("records the error and rethrows when the trace is invalid", async () => {
    // A non-array trace fails telemetryTraceSchema.parse before the tool runs.
    const { innerExecute, run, spanUpdate } = setup({ trace: {} as any });

    await expect(run()).rejects.toThrow();

    expect(innerExecute).not.toHaveBeenCalled();
    expect(spanUpdate).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        error: true,
        "app.error": expect.any(String),
      }),
    });
  });
});
