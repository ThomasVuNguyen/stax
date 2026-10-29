/** Port of domain/project/dto/SXSProjectInferenceMonitoringSummaryDTO (camelCase JSON). */
import type { ProjectInferenceMonitoringSummaryDTO } from "../../analytics/inference/dto/ProjectInferenceMonitoringSummaryDTO";

export interface SXSProjectInferenceMonitoringSummaryDTO {
  sideA: ProjectInferenceMonitoringSummaryDTO | null;
  sideB: ProjectInferenceMonitoringSummaryDTO | null;
  /** sideA - sideB. */
  delta: ProjectInferenceMonitoringSummaryDTO | null;
}
