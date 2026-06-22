/**
 * Capture utility (not a test).
 *
 * Re-records the live Honeycomb MCP `get_query_results`  into the
 * fixture consumed by the step tests. Makes a real network call and overwrites
 * the fixture, so run it only when refreshing the data:
 *
 *   npx tsx tests/utilities/capture-query-results.ts
 *
 * Requires a valid HONEYCOMB_MCP_KEY (loaded via src/mastra/config/env.ts) and a live
 * `lisaExpected.resultUrl`. Honeycomb query runs expire, so the URL in the
 * fixture may need updating from the Honeycomb UI before re-capturing.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { honeycomb_get_query_results } from "@/mcp/mcpClients";
import { lisaExpected } from "../fixtures/sample_alerts/lisa-normalized";

const DEST = fileURLToPath(
  new URL("../fixtures/sample_alerts/lisa-query-results.json", import.meta.url),
);

async function main() {
  if (!honeycomb_get_query_results.execute) {
    throw new Error("honeycomb_get_query_results has no execute()");
  }

  const out = await honeycomb_get_query_results.execute(
    { url: lisaExpected.resultUrl },
    {} as never,
  );

  if ((out as { isError?: boolean }).isError) {
    throw new Error(
      `MCP returned an error envelope (stale URL or wrong HONEYCOMB_MCP_KEY?):\n${JSON.stringify(out, null, 2)}`,
    );
  }

  writeFileSync(DEST, JSON.stringify(out, null, 2));
  console.log(`Wrote ${DEST}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
