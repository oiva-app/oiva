/**
 * Composition root for the data layer. Pool is created once in db/client.ts;
 * each repository singleton receives it here. Workflow steps import the
 * repositories from this module — never the adapter classes directly.
 *
 * If/when a second vendor or test double is needed, this is the file that
 * decides which adapter is wired in.
 */

import { pool } from "../db/client";
import { PgIncidentRepository } from "./pg-incident-repository";
import { PgAlertRepository } from "./pg-alert-repository";
import { PgReportRepository } from "./pg-report-repository";

export const incidentRepository = new PgIncidentRepository(pool);
export const alertRepository = new PgAlertRepository(pool);
export const reportRepository = new PgReportRepository(pool);
