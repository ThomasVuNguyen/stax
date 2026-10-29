/**
 * Port of domain/project/dto/ProjectDTO (snake_case JSON, @JsonInclude(NON_NULL)).
 * `ProjectDTO.from(project)` (builder) / `ProjectDTO.of(project)` → `from` / `of`, plus `toJson`
 * which drops null fields like Jackson did. The request side (POST/PATCH bodies) uses the same
 * JSON names; output-only fields are ignored by the controller.
 */
import type { Project } from "../../../entities/Project";
import { getIsDefault } from "../../../entities/Project";
import type { EvaluationType } from "../../../enums/EvaluationType";
import type { ModelProvider } from "../../../enums/ModelProvider";
import { InvalidDataException } from "../../../lib/errors";
import type { ProjectInferenceMonitoringSummaryDTO } from "../../analytics/inference/dto/ProjectInferenceMonitoringSummaryDTO";
import type { JobStatusDTO } from "../../job/dto/JobStatusDTO";
import type { HumanEvalMetricsDTO } from "./HumanEvalMetricsDTO";
import type { LatestEvalScoreDTO } from "./LatestEvalScoreDTO";

export interface ProjectDTO {
  project_id?: string | null;
  name?: string | null;
  type?: EvaluationType | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_default_project?: boolean | null;
  job_statuses?: JobStatusDTO[] | null;
  total_job_tasks?: number | null;
  finished_job_tasks?: number | null;
  providers?: ModelProvider[] | null;
  inference_monitoring_summary?: ProjectInferenceMonitoringSummaryDTO | null;
  human_eval_metrics?: HumanEvalMetricsDTO | null;
  latest_eval_score?: LatestEvalScoreDTO | null;
}

/** `ProjectDTO.from(project)`: the builder pre-filled from the entity. */
export function from(project: Project): ProjectDTO {
  return {
    project_id: project.id,
    name: project.name,
    type: project.evaluationType,
    description: project.description,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    is_default_project: getIsDefault(project),
  };
}

/** `ProjectDTO.of(project)`. */
export function of(project: Project): ProjectDTO {
  return toJson(from(project));
}

/** @JsonInclude(NON_NULL). */
export function toJson(dto: ProjectDTO): ProjectDTO {
  return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== null && v !== undefined)) as ProjectDTO;
}

/** Default (non CreateProject) validation group: `@Length(max = 1500) description`. */
export function validate(dto: ProjectDTO): void {
  if (dto.description != null && dto.description.length > 1500) {
    throw new InvalidDataException("description: Project description can't exceed 1500 characters");
  }
}
