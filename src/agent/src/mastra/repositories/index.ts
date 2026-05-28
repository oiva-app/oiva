import { pool } from "../db/client";
import { PgIncidentRepository } from "./pg-incident-repository";
import { PgAlertRepository } from "./pg-alert-repository";
import { PgReportRepository } from "./pg-report-repository";

export const incidentRepository = new PgIncidentRepository(pool);
export const alertRepository = new PgAlertRepository(pool);
export const reportRepository = new PgReportRepository(pool);
