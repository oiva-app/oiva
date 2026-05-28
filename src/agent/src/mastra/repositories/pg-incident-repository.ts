import type { Pool } from "pg";
import type {
  CorrelationLookup,
  Incident,
  IncidentRepository,
  IncidentStatus,
} from "../ports/incident-repository";

export class PgIncidentRepository implements IncidentRepository {
  constructor(private readonly pool: Pool) {}

  create(_input?: { status?: IncidentStatus }): Promise<Incident> {
    throw new Error("PgIncidentRepository.create not implemented");
  }

  findById(_id: string): Promise<Incident | null> {
    throw new Error("PgIncidentRepository.findById not implemented");
  }

  updateStatus(_id: string, _next: IncidentStatus): Promise<Incident> {
    throw new Error("PgIncidentRepository.updateStatus not implemented");
  }

  findActiveCandidates(_opts: CorrelationLookup): Promise<Incident[]> {
    throw new Error(
      "PgIncidentRepository.findActiveCandidates not implemented",
    );
  }
}
