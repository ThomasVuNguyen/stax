import { bool, newId, toBool } from "../lib/db";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "pointwise_heuristic_evaluation_score";
export const ID_PREFIX = "pointwise_eval_score-";

export interface PointwiseHeuristicEvaluationScore {
  id: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** @ManyToOne ModelResponse modelResponse (model_response_id) */
  modelResponseId: string | null;
  /** @ManyToOne PointwiseHeuristicEvaluator pointwiseEvaluator (column pointwise_heuristic_id) */
  pointwiseEvaluatorId: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** column is_match (JSON "match") */
  isMatch: boolean;
  /** @OneToOne EvaluationStatus evaluationStatus (column evaluation_status, cascade ALL) */
  evaluationStatusId: string | null;
}

export const COLUMNS: Record<keyof PointwiseHeuristicEvaluationScore, string> = {
  id: "id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  modelResponseId: "model_response_id",
  pointwiseEvaluatorId: "pointwise_heuristic_id",
  userId: "user_id",
  isMatch: "is_match",
  evaluationStatusId: "evaluation_status",
};

export function create(init: Partial<PointwiseHeuristicEvaluationScore> = {}): PointwiseHeuristicEvaluationScore {
  return {
    id: null,
    createdAt: null,
    updatedAt: null,
    modelResponseId: null,
    pointwiseEvaluatorId: null,
    userId: null,
    isMatch: false,
    evaluationStatusId: null,
    ...init,
  };
}

export function prePersist(e: PointwiseHeuristicEvaluationScore): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): PointwiseHeuristicEvaluationScore {
  return {
    id: str(row.id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    modelResponseId: str(row.model_response_id),
    pointwiseEvaluatorId: str(row.pointwise_heuristic_id),
    userId: str(row.user_id),
    isMatch: toBool(row.is_match) ?? false,
    evaluationStatusId: str(row.evaluation_status),
  };
}

export function toRow(e: PointwiseHeuristicEvaluationScore): Record<string, Param> {
  return {
    id: e.id,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    model_response_id: e.modelResponseId,
    pointwise_heuristic_id: e.pointwiseEvaluatorId,
    user_id: e.userId,
    is_match: bool(e.isMatch ?? false),
    evaluation_status: e.evaluationStatusId,
  };
}

/** Scalar fields (boolean `isMatch` → "match"); callers add relations. */
export function toJson(e: PointwiseHeuristicEvaluationScore): Record<string, unknown> {
  return { id: e.id, createdAt: e.createdAt, updatedAt: e.updatedAt, match: e.isMatch };
}
