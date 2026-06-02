import { describe, test, expect, vi } from "vitest"

test("Expect math to work", () => {
  const fn = vi.fn((a:number, b:number) => a + b)

  expect(fn(1, 1)).toBe(2)
})