import { newId } from "../lib/db";
import type { ScoreType } from "../enums/ScoreType";
import * as ScoreTypeConverter from "../util/converter/ScoreTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "pairwise_score";
export const ID_PREFIX = "pairwise-score-";

export interface PairwiseScore {
  id: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** @ManyToOne SxsEvaluationPair pair (column sxs_evaluation_pair) */
  pairId: string | null;
  /** @ManyToOne ChatTurn chatTurnA (column chat_turn_a) */
  chatTurnAId: string | null;
  /** @ManyToOne ChatTurn chatTurnB (column chat_turn_b) */
  chatTurnBId: string | null;
  score: string | null;
  /** score_type column (see the note on ScoreV2.scoreType: read as ScoreType). */
  scoreType: ScoreType | null;
  scorer: string | null;
  /** @ManyToOne PairwiseLLMEvaluator llmEvaluator (column pairwise_llm_evaluator) */
  llmEvaluatorId: string | null;
  userId: string | null;
  llmResponse: string | null;
  /** @OneToOne EvaluationStatus evaluationStatus (column evaluation_status, cascade ALL) */
  evaluationStatusId: string | null;
  /** @OneToOne EvaluationMonitoring evaluationMonitoring (evaluation_monitoring_id) */
  evaluationMonitoringId: string | null;
  /** @Transient */
  status?: string | null;
}

export const COLUMNS: Record<Exclude<keyof PairwiseScore, "status">, string> = {
  id: "id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  pairId: "sxs_evaluation_pair",
  chatTurnAId: "chat_turn_a",
  chatTurnBId: "chat_turn_b",
  score: "score",
  scoreType: "score_type",
  scorer: "scorer",
  llmEvaluatorId: "pairwise_llm_evaluator",
  userId: "user_id",
  llmResponse: "llm_response",
  evaluationStatusId: "evaluation_status",
  evaluationMonitoringId: "evaluation_monitoring_id",
};

export function create(init: Partial<PairwiseScore> = {}): PairwiseScore {
  return {
    id: null,
    createdAt: null,
    updatedAt: null,
    pairId: null,
    chatTurnAId: null,
    chatTurnBId: null,
    score: null,
    scoreType: null,
    scorer: null,
    llmEvaluatorId: null,
    userId: null,
    llmResponse: null,
    evaluationStatusId: null,
    evaluationMonitoringId: null,
    status: null,
    ...init,
  };
}

export function prePersist(e: PairwiseScore): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): PairwiseScore {
  return {
    id: str(row.id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    pairId: str(row.sxs_evaluation_pair),
    chatTurnAId: str(row.chat_turn_a),
    chatTurnBId: str(row.chat_turn_b),
    score: str(row.score),
    scoreType: ScoreTypeConverter.convertToEntityAttribute(row.score_type),
    scorer: str(row.scorer),
    llmEvaluatorId: str(row.pairwise_llm_evaluator),
    userId: str(row.user_id),
    llmResponse: str(row.llm_response),
    evaluationStatusId: str(row.evaluation_status),
    evaluationMonitoringId: str(row.evaluation_monitoring_id),
    status: null,
  };
}

export function toRow(e: PairwiseScore): Record<string, Param> {
  return {
    id: e.id,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    sxs_evaluation_pair: e.pairId,
    chat_turn_a: e.chatTurnAId,
    chat_turn_b: e.chatTurnBId,
    score: e.score,
    score_type: ScoreTypeConverter.convertToDatabaseColumn(e.scoreType),
    scorer: e.scorer,
    pairwise_llm_evaluator: e.llmEvaluatorId,
    user_id: e.userId,
    llm_response: e.llmResponse,
    evaluation_status: e.evaluationStatusId,
    evaluation_monitoring_id: e.evaluationMonitoringId,
  };
}

/** Scalar fields; callers add pair / chatTurnA / chatTurnB / llmEvaluator / evaluationStatus / evaluationMonitoring. */
export function toJson(e: PairwiseScore): Record<string, unknown> {
  return {
    id: e.id,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    score: e.score,
    scoreType: e.scoreType,
    scorer: e.scorer,
    userId: e.userId,
    llmResponse: e.llmResponse,
    status: e.status ?? null,
  };
}
