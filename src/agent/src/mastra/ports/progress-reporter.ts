/**
 * ProgressReporter — port.
 *
 * The single sink for incident *lifecycle events*. Producers — the workflow,
 * the supervisor's delegation hooks, the alert webhook handler, the close/retry
 * handlers, and the reaper — emit semantic events here; an adapter decides how
 * (and whether) to surface them. The SlackProgressReporter adapter renders the
 * live incident message from this stream.
 *
 * Deliberately Slack-agnostic: no thread ids, channels, or blocks cross this
 * boundary — only `incidentId` plus domain data. That keeps the supervisor
 * agent and the workflow free of any Slack dependency, so they can be tested
 * against a fake (see FakeProgressReporter).
 *
 * Best-effort contract: every method MUST NOT throw. Surfacing progress can
 * never be allowed to fail an investigation, so adapters swallow and log their
 * own errors and always resolve.
 */
import type { AlertContext } from "@/domain/alert-context";
import type { IncidentReport } from "@/domain/incident-report";
import type { IncidentStatus } from "@/domain/incident";

/** Outcome of a single sub-agent delegation, as seen by the supervisor hooks. */
export interface DelegationOutcome {
  durationMs: number;
  success: boolean;
  /**
   * One-line finding the sub-agent led with. Adapters fall back to a generic
   * "done" line when absent.
   */
  headline?: string;
}

/** Who/what moved an incident to `closed`. Drives the attribution + render path. */
export type ClosedBy = { kind: "user"; userId: string } | { kind: "reaper" };

export interface ProgressReporter {
  // ── Lifecycle / badge ──────────────────────────────────────────────
  /** Post the incident's root message and persist its thread identity. */
  incidentOpened(incidentId: string, alert: AlertContext): Promise<void>;
  /** Reflect an in-flight status change as a badge update. */
  statusChanged(incidentId: string, status: IncidentStatus): Promise<void>;

  // ── Activity log ───────────────────────────────────────────────────
  /** Append a one-off completed line, e.g. "Alert verified". */
  milestone(incidentId: string, label: string): Promise<void>;
  /**
   * Append an in-progress line for a starting task. `taskKey` is a stable
   * identifier (e.g. "telemetry-agent", "report"); the adapter maps it to
   * present/past phrasing.
   */
  delegationStarted(incidentId: string, taskKey: string): Promise<void>;
  /** Finalize the in-progress line with duration, headline, and outcome. */
  delegationCompleted(
    incidentId: string,
    taskKey: string,
    outcome: DelegationOutcome,
  ): Promise<void>;

  // ── Alert volume (Q1) ──────────────────────────────────────────────
  /** Bump the single in-place "related alerts" counter for an active incident. */
  alertAttached(incidentId: string): Promise<void>;

  // ── Terminal renders ───────────────────────────────────────────────
  /** Render the final summary in place, with rating + Close controls. */
  reportReady(
    incidentId: string,
    report: IncidentReport,
    resultUrl: string,
  ): Promise<void>;
  /** Upload the full report markdown to the thread (independent failure path). */
  attachReportFile(incidentId: string, report: IncidentReport): Promise<void>;
  /** Render the failure state, with Retry + Close controls. */
  incidentFailed(
    incidentId: string,
    failure: { reason: string },
  ): Promise<void>;
  /**
   * Surface that the incident was closed. Both closers — `by.kind === "user"`
   * and `by.kind === "reaper"` — are handled the same way: a threaded reply with
   * attribution, leaving the root message as it last rendered. (The activity log
   * is in-memory only, so a cold reaper run couldn't rebuild the root anyway;
   * keeping both paths to a reply keeps the close notification consistent.)
   */
  incidentClosed(incidentId: string, by: ClosedBy): Promise<void>;
}
