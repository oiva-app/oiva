import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeAlert } from "../../../src/mastra/adapters/honeycomb-adapter";
import { honeycombWebhookPayloadSchema } from "../../../src/mastra/types/honeycomb-alert";
import { alertContextSchema } from "../../../src/mastra/types/alert-context";

function loadFixture(name: string) {
  const url = new URL(`../../fixtures/sample_alerts/${name}`, import.meta.url);
  const raw = JSON.parse(readFileSync(fileURLToPath(url), "utf-8"));
  // Parse through the wire schema so the fixture is validated as a real
  // Honeycomb webhook payload before we hand it to normalizeAlert.
  return honeycombWebhookPayloadSchema.parse(raw);
}

describe("normalizeAlert (honeycomb-adapter)", () => {
  it("maps the lisa.json payload to an AlertContext", () => {
    const payload = loadFixture("lisa.json");
    const ctx = normalizeAlert(payload);

    // Output conforms to the AlertContext schema.
    expect(() => alertContextSchema.parse(ctx)).not.toThrow();

    expect(ctx).toEqual({
      status: "TRIGGERED",
      isTest: false,
      triggerName: "error == true",
      description: "COUNT of error = true >= 1 over the course of 5 minutes",
      environment: "astro-lisa",
      datasets: ["__all__"],
      groupsTriggered: [
        { field: "service.name", value: "product-catalog", count: 2736 },
        { field: "service.name", value: "frontend", count: 2734 },
        { field: "service.name", value: "frontend-proxy", count: 684 },
        { field: "service.name", value: "ad", count: 9 },
        { field: "service.name", value: "fraud-detection", count: 9 },
        { field: "service.name", value: "load-generator", count: 4 },
      ],
      alert: { timestamp: "May 18 2026 13:21:03 UTC-04:00" },
      resultUrl:
        "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/result/4SSzmNoFT8d?utm_content=view_graph&utm_medium=Trigger&utm_source=webhook",
      triggerUrl:
        "https://ui.honeycomb.io/senorvalenz-gettingstarted/environments/astro-lisa/triggers/2XteoXm4S78?utm_content=edit_trigger&utm_medium=Trigger&utm_source=webhook",
      instanceId: "1015bd0f-99a3-41e7-817e-9c831df21262",
    });
  });

  it("keeps the explicit datasets array rather than parsing the URL", () => {
    const payload = loadFixture("lisa.json");
    // lisa.json has datasets: ["__all__"] — its trigger URL has no
    // /datasets/<name>/ segment, so a URL fallback would yield []. Asserting
    // ["__all__"] proves the explicit array wins.
    expect(normalizeAlert(payload).datasets).toEqual(["__all__"]);
  });
});

import { describe, it, expect } from "vitest";
import {
  verifyAlert,
  normalizeAlert,
  extractQueryId,
} from "../../../src/mastra/adapters/honeycomb-adapter";
import type { HoneycombWebhookPayload } from "../../../src/mastra/types/honeycomb-alert";

function payload(
  overrides: Partial<HoneycombWebhookPayload> = {},
  alertOverrides: Partial<HoneycombWebhookPayload["alert"]> = {},
): HoneycombWebhookPayload {
  const { alert: overrideAlert, ...restOverrides } = overrides;

  return {
    secret: "s3cr3t",
    name: "Too many HTTP request errors",
    id: "sbLy6gwM56r",
    description: "500-level HTTP status requests",
    links: {
      url: "https://ui.honeycomb.io/team/environments/env/datasets/gateway/triggers/sbLy6gwM56r",
    },
    environment: "homelab-env",
    threshold: { op: "greater than", value: "0.05" },
    datasets: ["gateway"],
    result: {
      groupsTriggered: [
        { field: "http.route", value: "/api/orders", count: 12 },
      ],
      links: {
        url: "https://ui.honeycomb.io/team/environments/env/datasets/gateway/result/8js9dkr9nf2/a/CZxFiuoAp5Z?utm_source=webhook",
      },
    },
    alert: {
      instanceId: "715de210-d961-466a-be70-89ba6a4b6fb5",
      description: "current value greater than threshold",
      status: "TRIGGERED",
      summary: "Too many HTTP request errors",
      timestamp: "2026-05-22T00:00:00Z",
      isTest: false,
      ...alertOverrides,
      ...overrideAlert,
    },
    ...restOverrides,
  };
}

describe("verifyAlert", () => {
  it("is actionable when the secret matches and the alert is a real TRIGGERED alert", () => {
    expect(verifyAlert(payload(), "s3cr3t", "s3cr3t")).toEqual({
      kind: "actionable",
    });
  });

  it("rejects a wrong secret", () => {
    expect(verifyAlert(payload(), "nope", "s3cr3t")).toEqual({
      kind: "invalid",
      reason: "wrong-secret",
    });
  });

  it("rejects a missing secret when one is configured", () => {
    expect(verifyAlert(payload(), undefined, "s3cr3t")).toEqual({
      kind: "invalid",
      reason: "missing-secret",
    });
  });

  it("skips the secret check entirely when no secret is configured (dev default)", () => {
    // Documents fail-open in dev; env.ts now forbids this in production.
    expect(verifyAlert(payload(), undefined, undefined)).toEqual({
      kind: "actionable",
    });
  });

  it("filters test alerts even when the secret is valid", () => {
    expect(
      verifyAlert(payload({}, { isTest: true }), "s3cr3t", "s3cr3t"),
    ).toEqual({
      kind: "filtered",
      reason: "test-alert",
    });
  });

  it("filters non-TRIGGERED (resolved) alerts", () => {
    expect(
      verifyAlert(payload({}, { status: "OK" }), "s3cr3t", "s3cr3t"),
    ).toEqual({
      kind: "filtered",
      reason: "status-not-triggered",
    });
  });

  it("checks the secret before applying content filters", () => {
    expect(
      verifyAlert(payload({}, { isTest: true }), "nope", "s3cr3t"),
    ).toEqual({ kind: "invalid", reason: "wrong-secret" });
  });
});

describe("normalizeAlert", () => {
  it("maps the wire payload onto the AlertContext shape", () => {
    const ctx = normalizeAlert(payload());
    expect(ctx).toMatchObject({
      status: "TRIGGERED",
      isTest: false,
      environment: "homelab-env",
      datasets: ["gateway"],
      instanceId: "715de210-d961-466a-be70-89ba6a4b6fb5",
      alert: { timestamp: "2026-05-22T00:00:00Z" },
    });
    expect(ctx.resultUrl).toContain("/result/8js9dkr9nf2/");
    expect(ctx.triggerUrl).toContain("/triggers/sbLy6gwM56r");
  });

  it("falls back to extracting the dataset from the trigger URL when datasets is empty", () => {
    const ctx = normalizeAlert(payload({ datasets: [] }));
    expect(ctx.datasets).toEqual(["gateway"]);
  });

  it("yields an empty dataset list when neither datasets nor URL provide one", () => {
    const ctx = normalizeAlert(
      payload({
        datasets: [],
        links: { url: "https://ui.honeycomb.io/no-dataset-here" },
      }),
    );
    expect(ctx.datasets).toEqual([]);
  });
});

describe("extractQueryId", () => {
  it("pulls the query id out of a result URL", () => {
    expect(
      extractQueryId(
        "https://ui.honeycomb.io/team/environments/env/datasets/gateway/result/8js9dkr9nf2/a/CZxFiuoAp5Z?utm_source=webhook",
      ),
    ).toBe("8js9dkr9nf2");
  });

  it("stops at a query string immediately after the id", () => {
    expect(
      extractQueryId("https://ui.honeycomb.io/x/result/abc123?foo=bar"),
    ).toBe("abc123");
  });

  it("returns null when the URL has no /result/ segment", () => {
    expect(
      extractQueryId("https://ui.honeycomb.io/x/datasets/gateway/triggers/y"),
    ).toBe(null);
  });
});
