/**
 * Port of domain/evaluator/human/dto/ScoreV2DTO (snake_case, NON_NULL). Only the type is ported:
 * the single producer (HumanEvaluatorService.getChatTurnFeedbacks) maps every score to null.
 */
import type { ScoreType } from "../../../../enums/ScoreType";

export interface ScoreV2DTO {
  id?: string;
  created_at?: string;
  updated_at?: string;
  score?: number;
  score_type?: ScoreType;
  scorer?: string;
  llm_response?: string;
  llm_output_response_dto?: string;
  source_id?: string;
  eval_monitoring_id?: string;
  eval_monitoring?: Record<string, unknown>;
}
