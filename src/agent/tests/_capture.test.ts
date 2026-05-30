import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { honeycomb_get_query_results } from "@/mcp/mcpClients";
import { lisaExpected } from "./fixtures/sample_alerts/lisa-normalized";

test("CAPTURE get_query_results output", async () => {
  if (!honeycomb_get_query_results.execute) throw new Error("no execute()");
  const out = await honeycomb_get_query_results.execute(
    { url: lisaExpected.resultUrl },
    {} as any,
  );
  const dest = fileURLToPath(
    new URL("./fixtures/sample_alerts/lisa-query-results.json", import.meta.url),
  );
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log("WROTE", dest);
  console.log(JSON.stringify(out, null, 2).slice(0, 1500));
});
