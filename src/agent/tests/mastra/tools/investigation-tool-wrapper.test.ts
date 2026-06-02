import { describe, test, expect, vi } from "vitest"
import { investigationToolWrapper } from "@/tools/investigation-tool-wrapper";

const wrappedTool = vi.fn()

test("Tool wrapper invokes the wrapped tool with the same arguments, minus 'question'", () => {
  // tktk
})

