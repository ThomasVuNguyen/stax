import { newId } from "../lib/db";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "model_response";
export const ID_PREFIX = "model-response-";

/**
 * Relations not on the interface (EAGER in Java; load explicitly):
 * - `model` → ModelRepository.findById(modelId)
 * - `humanEvalScores` → HumanEvalScoreRepository (by model_response_id)
 * - `scores` → ScoreV2Repository (by model_response_id)
 * - `pointwiseHeuristicEvaluationScores` → PointwiseHeuristicEvaluationScoreRepository
 * The three score tables have `ON DELETE CASCADE` on model_response_id, which covers the
 * JPA cascade/orphanRemoval on delete.
 */
export interface ModelResponse {
  id: string | null;
  text: string | null;
  thinking: string | null;
  /** @ManyToOne Model model (model_id) */
  modelId: string | null;
  /** @OneToOne InferenceMonitoring inferenceMonitoring (inference_monitoring_id, cascade PERSIST) */
  inferenceMonitoringId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne EvaluationContainer container (container_id) */
  containerId: string | null;
}

export const COLUMNS: Record<keyof ModelResponse, string> = {
  id: "id",
  text: "text",
  thinking: "thinking",
  modelId: "model_id",
  inferenceMonitoringId: "inference_monitoring_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
  userId: "user_id",
  containerId: "container_id",
};

export function create(init: Partial<ModelResponse> = {}): ModelResponse {
  return {
    id: null,
    text: null,
    thinking: null,
    modelId: null,
    inferenceMonitoringId: null,
    createdAt: null,
    updatedAt: null,
    userId: null,
    containerId: null,
    ...init,
  };
}

export function prePersist(e: ModelResponse): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function getEntityId(e: ModelResponse): string | null {
  return e.id;
}

/** `validateResponseId(responseId)`: has the prefix and the length of prefix + UUID. */
export function validateResponseId(responseId: string): boolean {
  return responseId.length === ID_PREFIX.length + 36 && responseId.startsWith(ID_PREFIX);
}

/** `deepCopy(container)`: text, thinking, model, user on another container. */
export function deepCopy(e: ModelResponse, containerId: string | null): ModelResponse {
  return create({ text: e.text, thinking: e.thinking, modelId: e.modelId, userId: e.userId, containerId });
}

export function fromRow(row: Row): ModelResponse {
  return {
    id: str(row.id),
    text: str(row.text),
    thinking: str(row.thinking),
    modelId: str(row.model_id),
    inferenceMonitoringId: str(row.inference_monitoring_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    userId: str(row.user_id),
    containerId: str(row.container_id),
  };
}

export function toRow(e: ModelResponse): Record<string, Param> {
  return {
    id: e.id,
    text: e.text,
    thinking: e.thinking,
    model_id: e.modelId,
    inference_monitoring_id: e.inferenceMonitoringId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    user_id: e.userId,
    container_id: e.containerId,
  };
}

/** Scalar fields + getter `entityId`; callers add model, scores, etc. */
export function toJson(e: ModelResponse): Record<string, unknown> {
  return {
    id: e.id,
    text: e.text,
    thinking: e.thinking,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    entityId: e.id,
  };
}
