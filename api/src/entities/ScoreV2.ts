import { newId, parseJson } from "../lib/db";
import type { ScoreType } from "../enums/ScoreType";
import * as ScoreTypeConverter from "../util/converter/ScoreTypeConverter";
import { type Param, type Row, num, str } from "./EntitySupport";

/** Java @Table(name = "Score"); the schema table is `score`. */
export const TABLE = "score";
export const ID_PREFIX = "score-";

export interface ScoreV2 {
  id: string | null;
  /** Deprecated column response_id. */
  responseId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Raw numeric score (Java field `score`; the Java *getter* getScore() returns a map — see getScore()). */
  score: number | null;
  /** @ManyToOne ModelResponse modelResponse (model_response_id) */
  modelResponseId: string | null;
  /**
   * score_type column. Java maps it with ScorerTypeConverter (a bug: that converter targets
   * ScorerType), which would read every ScoreType name back as null; we read it as ScoreType.
   */
  scoreType: ScoreType | null;
  scorer: string | null;
  /** @ManyToOne LLMEvaluator llmEvaluator (column llm_evaluator) */
  llmEvaluatorId: string | null;
  userId: string | null;
  llmResponse: string | null;
  /** @OneToOne EvaluationStatus evaluationStatus (column evaluation_status, cascade ALL) */
  evaluationStatusId: string | null;
  llmOutputResponseDTO: string | null;
  /** @OneToOne EvaluationMonitoring evaluationMonitoring (evaluation_monitoring_id) */
  evaluationMonitoringId: string | null;
  sourceId: string | null;
  /** @Transient */
  status?: string | null;
}

export const COLUMNS: Record<Exclude<keyof ScoreV2, "status">, string> = {
  id: "id",
  responseId: "response_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  score: "score",
  modelResponseId: "model_response_id",
  scoreType: "score_type",
  scorer: "scorer",
  llmEvaluatorId: "llm_evaluator",
  userId: "user_id",
  llmResponse: "llm_response",
  evaluationStatusId: "evaluation_status",
  llmOutputResponseDTO: "llm_output_response_dto",
  evaluationMonitoringId: "evaluation_monitoring_id",
  sourceId: "source_id",
};

export function create(init: Partial<ScoreV2> = {}): ScoreV2 {
  return {
    id: null,
    responseId: null,
    createdAt: null,
    updatedAt: null,
    score: null,
    modelResponseId: null,
    scoreType: null,
    scorer: null,
    llmEvaluatorId: null,
    userId: null,
    llmResponse: null,
    evaluationStatusId: null,
    llmOutputResponseDTO: null,
    evaluationMonitoringId: null,
    sourceId: null,
    status: null,
    ...init,
  };
}

export function prePersist(e: ScoreV2): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/** `getScoreData()`: the raw numeric score. */
export function getScoreData(e: ScoreV2): number | null {
  return e.score;
}

/** `getScore()`: the map Jackson emitted as "score". */
export function getScore(e: ScoreV2): Record<string, unknown> {
  const m: Record<string, unknown> = {
    id: e.id,
    scorer: e.scorer,
    score: e.score,
    score_type: e.scoreType,
    status: e.status ?? null,
  };
  if (e.llmResponse != null && e.llmResponse !== "") m.llm_response = e.llmResponse;
  if (e.llmEvaluatorId != null) m.llm_evaluator = e.llmEvaluatorId;
  if (e.llmOutputResponseDTO != null && e.llmOutputResponseDTO !== "")
    m.llm_output_response_dto = parseJson(e.llmOutputResponseDTO);
  return m;
}

/**
 * `deepCopy(modelResponse)`: copies score fields. Evaluation status/monitoring must be copied
 * separately (as in Java).
 */
export function deepCopy(e: ScoreV2, modelResponseId: string | null): ScoreV2 {
  return create({
    modelResponseId,
    score: e.score,
    scoreType: e.scoreType,
    scorer: e.scorer,
    llmEvaluatorId: e.llmEvaluatorId,
    userId: e.userId,
    llmResponse: e.llmResponse,
    status: e.status,
  });
}

export function fromRow(row: Row): ScoreV2 {
  return {
    id: str(row.id),
    responseId: str(row.response_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    score: num(row.score),
    modelResponseId: str(row.model_response_id),
    scoreType: ScoreTypeConverter.convertToEntityAttribute(row.score_type),
    scorer: str(row.scorer),
    llmEvaluatorId: str(row.llm_evaluator),
    userId: str(row.user_id),
    llmResponse: str(row.llm_response),
    evaluationStatusId: str(row.evaluation_status),
    llmOutputResponseDTO: str(row.llm_output_response_dto),
    evaluationMonitoringId: str(row.evaluation_monitoring_id),
    sourceId: str(row.source_id),
    status: null,
  };
}

export function toRow(e: ScoreV2): Record<string, Param> {
  return {
    id: e.id,
    response_id: e.responseId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    score: e.score,
    model_response_id: e.modelResponseId,
    score_type: ScoreTypeConverter.convertToDatabaseColumn(e.scoreType),
    scorer: e.scorer,
    llm_evaluator: e.llmEvaluatorId,
    user_id: e.userId,
    llm_response: e.llmResponse,
    evaluation_status: e.evaluationStatusId,
    llm_output_response_dto: e.llmOutputResponseDTO,
    evaluation_monitoring_id: e.evaluationMonitoringId,
    source_id: e.sourceId,
  };
}

/**
 * Jackson view (@Data): "score" is the getScore() map and "scoreData" the number. Callers add
 * modelResponse / llmEvaluator / evaluationStatus / evaluationMonitoring objects.
 */
export function toJson(e: ScoreV2): Record<string, unknown> {
  return {
    id: e.id,
    responseId: e.responseId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    score: getScore(e),
    scoreData: e.score,
    scoreType: e.scoreType,
    scorer: e.scorer,
    userId: e.userId,
    llmResponse: e.llmResponse,
    llmOutputResponseDTO: e.llmOutputResponseDTO,
    sourceId: e.sourceId,
    status: e.status ?? null,
  };
}
