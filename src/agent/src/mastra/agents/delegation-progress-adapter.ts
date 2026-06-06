import type { ProgressReporter } from "../ports/progress-reporter";
import { incidentIdFromThreadId } from "../domain/incident-thread";
import { parseHeadline } from "../domain/headline";

const AGENT_LABELS: Record<string, string> = {
  "codebase-agent": "Codebase agent",
  "telemetry-agent": "Telemetry agent",
};
const labelFor = (primitiveId: string): string =>
  AGENT_LABELS[primitiveId] ?? primitiveId;

export class DelegationProgressTracker {
  private readonly incidents = new Map<string, string>(); // toolCallId -> incidentId

  constructor(private readonly reporter: ProgressReporter) {}

  async started(ctx: {
    threadId?: string;
    toolCallId: string;
    primitiveId: string;
  }): Promise<void> {
    const incidentId = incidentIdFromThreadId(ctx.threadId);
    if (!incidentId) return;
    this.incidents.set(ctx.toolCallId, incidentId);
    await this.reporter.delegationStarted(
      incidentId,
      labelFor(ctx.primitiveId),
    );
  }

  async completed(ctx: {
    toolCallId: string;
    primitiveId: string;
    duration: number;
    success: boolean;
    result?: { text: string };
    error?: Error;
  }): Promise<void> {
    const incidentId = this.incidents.get(ctx.toolCallId);
    if (!incidentId) return;
    this.incidents.delete(ctx.toolCallId);
    await this.reporter.delegationCompleted(
      incidentId,
      labelFor(ctx.primitiveId),
      {
        durationMs: ctx.duration,
        success: ctx.success,
        headline: parseHeadline(ctx.result?.text) ?? ctx.error?.message,
      },
    );
  }
}
