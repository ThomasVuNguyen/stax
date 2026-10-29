/**
 * Port of analytics/evaluation/dto/EvaluationMonitoringDTO (Taggable).
 * `new EvaluationMonitoringDTO(em)` → `fromEvaluationMonitoring(em, evaluator)`: the evaluator
 * (em.evaluatorId) must be loaded by the caller for its name. `tags` stays null until set.
 */
import type { EvaluationMonitoring } from "../../../../entities/EvaluationMonitoring";
import { TagLinkTargetType } from "../../../../enums/TagLinkTargetType";
import type { TagDTO } from "../../../tags/dto/TagDTO";

export interface EvaluationMonitoringDTO {
  id: string | null;
  eval_model_id: string | null;
  project_id: string | null;
  evaluator_name: string | null;
  evaluator_id: string | null;
  time_taken: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_at: string | null;
  updated_at: string | null;
  tags: TagDTO[] | null;
}

export function fromEvaluationMonitoring(
  em: EvaluationMonitoring,
  evaluator: { id: string | null; name: string | null },
): EvaluationMonitoringDTO {
  return {
    id: em.id,
    eval_model_id: em.modelId,
    project_id: em.containerId,
    evaluator_name: evaluator.name,
    evaluator_id: evaluator.id,
    time_taken: em.timeTaken,
    prompt_tokens: em.promptTokens,
    completion_tokens: em.completionTokens,
    total_tokens: em.totalTokens,
    created_at: em.createdAt,
    updated_at: em.updatedAt,
    tags: null,
  };
}

export function getTagLinkTargetType(): TagLinkTargetType {
  return TagLinkTargetType.EVALUATION_MONITORING;
}
