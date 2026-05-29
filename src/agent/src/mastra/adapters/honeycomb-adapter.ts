// HC verifyAlert + normalizeAlert → AlertContext
// future: datadog-alert.ts, signoz-alert.ts

// Pure domain logic. No Mastra, no env, no I/O. Easy to unit-test.
// (env.HC_SHARED_SECRET is read here only as a function param — the caller passes it in.)

import type { HoneycombWebhookPayload } from "../types/honeycomb-alert";
import type { AlertContext } from "../types/alert-context";

export type VerifyResult =
  | { kind: "invalid"; reason: "wrong-secret" | "missing-secret" }
  | { kind: "filtered"; reason: "test-alert" | "status-not-triggered" }
  | { kind: "actionable" };

export function verifyAlert(
  payload: HoneycombWebhookPayload,
  configuredSecret: string | undefined,
): VerifyResult {
  // Only enforce if a secret is configured (dev defaults to no-secret).
  if (configuredSecret) {
    if (!payload.secret)
      return {
        kind: "invalid",
        reason: "missing-secret",
      };
    if (payload.secret !== configuredSecret)
      return { kind: "invalid", reason: "wrong-secret" };
  }
  if (payload.alert.isTest)
    return {
      kind: "filtered",
      reason: "test-alert",
    };
  if (payload.alert.status !== "TRIGGERED")
    return { kind: "filtered", reason: "status-not-triggered" };
  return { kind: "actionable" };
}

function extractDatasetFromUrl(url: string): string[] {
  // e.g. ".../datasets/gateway/triggers/..." => ["gateway"]
  const match = url.match(/\/datasets\/([^/]+)\//);
  return match ? [match[1]] : [];
}

export function normalizeAlert(payload: HoneycombWebhookPayload): AlertContext {
  const datasets =
    payload.datasets && payload.datasets.length > 0
      ? payload.datasets
      : extractDatasetFromUrl(payload.links.url);
  return {
    status: payload.alert.status,
    isTest: payload.alert.isTest,
    triggerName: payload.name,
    description: payload.description,
    environment: payload.environment,
    datasets,
    groupsTriggered: payload.result.groupsTriggered,
    alert: {
      timestamp: payload.alert.timestamp,
    },
    resultUrl: payload.result.links.url,
    triggerUrl: payload.links.url,
    instanceId: payload.alert.instanceId,
  };
}

export function extractQueryId(resultUrl: string): string | null {
  const match = resultUrl.match(/\/result\/([^/?]+)/);
  return match ? match[1] : null;
}
