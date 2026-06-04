import { incidentRepository } from "../repositories";
import { SlackProgressReporter } from "./progress-reporter";

export const progressReporter = new SlackProgressReporter(incidentRepository);
