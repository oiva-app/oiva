import { randomUUID } from "node:crypto";
import type {
  CorrelationLookup,
  Incident,
  IncidentRepository,
  IncidentStatus,
} from "../ports/incident-repository";

// Mirrors PgIncidentRepository.updateStatus's resolved_at policy: set on
// entering report_delivered or closed (end-of-lifecycle transitions),
// NOT on entering failed (which is retryable).
const RESOLVED_AT_STATUSES: ReadonlySet<IncidentStatus> = new Set([
  "report_delivered",
  "closed",
]);

export class FakeIncidentRepository implements IncidentRepository {
  /** Every incident the fake currently knows about, keyed by id. */
  readonly incidents = new Map<string, Incident>();

  /** Clear state between tests. */
  reset(): void {
    this.incidents.clear();
  }

  async create(input?: { status?: IncidentStatus }): Promise<Incident> {
    const now = new Date();
    const incident: Incident = {
      id: randomUUID(),
      status: input?.status ?? "triggered",
      createdAt: now,
      statusUpdated: now,
      resolvedAt: null,
      slackThreadTs: null,
      slackChannelId: null,
    };
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async findById(id: string): Promise<Incident | null> {
    return this.incidents.get(id) ?? null;
  }

  async updateStatus(id: string, next: IncidentStatus): Promise<Incident> {
    const existing = this.incidents.get(id);
    if (!existing) {
      throw new Error(
        `FakeIncidentRepository.updateStatus: incident ${id} not found`,
      );
    }
    const now = new Date();
    const updated: Incident = {
      ...existing,
      status: next,
      statusUpdated: now,
      resolvedAt:
        RESOLVED_AT_STATUSES.has(next) && existing.resolvedAt === null
          ? now
          : existing.resolvedAt,
    };
    this.incidents.set(id, updated);
    return updated;
  }

  async findActiveCandidates(_opts: CorrelationLookup): Promise<Incident[]> {
    throw new Error(
      "FakeIncidentRepository.findActiveCandidates: not implemented in fake " +
        "(joins alerts table; use the real pg adapter or extend this fake)",
    );
  }

  async attachSlackThread(
    id: string,
    slack: { slackThreadTs: string; slackChannelId: string },
  ): Promise<void> {
    const existing = this.incidents.get(id);
    if (!existing) {
      throw new Error(
        `FakeIncidentRepository.attachSlackThread: incident ${id} not found`,
      );
    }
    this.incidents.set(id, {
      ...existing,
      slackThreadTs: slack.slackThreadTs,
      slackChannelId: slack.slackChannelId,
    });
  }

  async findStaleIncidents(opts: {
    statuses: IncidentStatus[];
    updatedBefore: Date;
  }): Promise<Incident[]> {
    const statusSet = new Set(opts.statuses);
    const matches: Incident[] = [];
    for (const incident of this.incidents.values()) {
      if (
        statusSet.has(incident.status) &&
        incident.statusUpdated < opts.updatedBefore
      ) {
        matches.push(incident);
      }
    }
    // Mirror pg's ORDER BY status_updated_at ASC.
    matches.sort(
      (a, b) => a.statusUpdated.getTime() - b.statusUpdated.getTime(),
    );
    return matches;
  }
}
