import { describe, it, expect, vi } from "vitest";
import { createWorkflow } from "@mastra/core/workflows";
import { lisaExpected } from "../../fixtures/sample_alerts/lisa-normalized";

// Importing the workflow module pulls in repositories (pg.Pool) and the knowledge-base sync (S3Client) 
vi.mock("@/config/env", () => ({
  env: {
    DATABASE_URL: "postgres://test",
    AWS_REGION: "us-east-1",
    OBSERVED_APP_NAME: "test-app",
    KNOWLEDGE_BASE_S3_BUCKET: "test-bucket",
    KNOWLEDGE_BASE_S3_PREFIX: "",
  },
}));

const { events, reporter } = vi.hoisted(() => {
  const events: { type: string; incidentId: string; args: unknown[] }[] = [];
  const reporter = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        return (...args: unknown[]) => {
          events.push({ type: prop, incidentId: args[0] as string, args });
          return Promise.resolve();
        };
      },
    },
  );
  return { events, reporter };
});

vi.mock("@/slack", () => ({ progressReporter: reporter }));

// Imported after the mocks are registered.
const { announce, oivaWorkflowStateSchema } = await import(
  "@/workflows/oiva-workflow"
);

describe("announce step (isolated)", () => {
  const onlyAnnounce = createWorkflow({
    id: "test-announce",
    inputSchema: announce.inputSchema,
    outputSchema: announce.outputSchema,
    stateSchema: oivaWorkflowStateSchema,
  })
    .then(announce)
    .commit();

  const incidentId = "534bcf91-8070-41ec-808b-abe472a239e7";

  it("opens the incident, then emits the Alert verified milestone in order", async () => {
    events.length = 0;

    const run = await onlyAnnounce.createRun();
    const result = await run.start({
      inputData: { incidentId, alertContext: lisaExpected },
    });

    expect(result.status).toBe("success");

    const forIncident = events.filter((e) => e.incidentId === incidentId);
    expect(forIncident.map((e) => e.type)).toEqual([
      "incidentOpened",
      "milestone",
    ]);
    const milestone = forIncident.find((e) => e.type === "milestone");
    expect(milestone?.args[1]).toBe("Alert verified");
  });
});
